import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { runInNewContext } from 'node:vm';

const project = resolve(import.meta.dirname, '../..');
const template = await readFile(join(project, 'public/sw.js'), 'utf8');
const resources = ['index.html', 'assets/app-a.js', 'assets/style-b.css', 'assets/font-c.woff2', 'icon.svg'];
const execute = promisify(execFile);

type WorkerRequest = { url: string; method: string; mode: string; headers?: Headers };
type Handler = (event: unknown) => void;

function makeCaches() {
  const fetch = vi.fn(async (request: string | WorkerRequest) =>
    new Response(`network: ${typeof request === 'string' ? request : request.url}`));
  const entries = new Map<string, ReturnType<typeof makeCache>>();
  function makeCache() {
    const contents = new Map<string, Response>();
    const storedHeaders = new Map<string, Headers>();
    return {
      contents,
      addAll: vi.fn(async (requests: (string | WorkerRequest)[]) => {
        const responses = await Promise.all(requests.map(async (request) => {
          const url = typeof request === 'string' ? request : request.url;
          const response = await fetch(request);
          if (!response.ok) throw new TypeError('Precache resource unavailable');
          return [url, response, typeof request === 'string' ? new Headers() : new Headers(request.headers)] as const;
        }));
        for (const [url, response, headers] of responses) {
          contents.set(url, response.clone());
          storedHeaders.set(url, headers);
        }
      }),
      match: vi.fn(async (request: string | WorkerRequest, options?: { ignoreVary?: boolean }) => {
        const url = typeof request === 'string' ? request : request.url;
        const response = contents.get(url);
        if (response && !options?.ignoreVary) {
          const headers = typeof request === 'string' ? new Headers() : new Headers(request.headers);
          const vary = response.headers.get('Vary')?.split(',').map((name) => name.trim().toLowerCase()) ?? [];
          if (vary.some((name) => name === '*' || headers.get(name) !== storedHeaders.get(url)?.get(name))) return undefined;
        }
        return response?.clone();
      }),
      put: vi.fn(async (request: string | WorkerRequest, response: Response) => {
        const url = typeof request === 'string' ? request : request.url;
        contents.set(url, response.clone());
        storedHeaders.set(url, typeof request === 'string' ? new Headers() : new Headers(request.headers));
      }),
    };
  }
  const storage = {
    open: vi.fn(async (name: string) => {
      if (!entries.has(name)) entries.set(name, makeCache());
      return entries.get(name)!;
    }),
    keys: vi.fn(async () => [...entries.keys()]),
    delete: vi.fn(async (name: string) => entries.delete(name)),
  };
  return { entries, fetch, storage };
}

function worker(options: { scope?: string; version?: string; caches?: ReturnType<typeof makeCaches> } = {}) {
  const scope = options.scope ?? 'https://portfolio.example/cadencia/';
  const caches = options.caches ?? makeCaches();
  const handlers = new Map<string, Handler>();
  const claim = vi.fn(async () => undefined);
  const skipWaiting = vi.fn();
  runInNewContext(template, {
    URL, Request, Response, caches: caches.storage, fetch: caches.fetch,
    self: {
      __PRECACHE__: resources, __VERSION__: options.version ?? 'release-a',
      registration: { scope }, clients: { claim }, skipWaiting,
      addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    },
  });

  return {
    ...caches, claim, skipWaiting,
    async lifecycle(type: 'install' | 'activate') {
      const pending: Promise<unknown>[] = [];
      handlers.get(type)!({ waitUntil: (promise: Promise<unknown>) => pending.push(promise) });
      await Promise.all(pending);
    },
    request(path: string, mode = 'cors', method = 'GET', headers?: Headers): Promise<Response> | undefined {
      let response: Promise<Response> | undefined;
      handlers.get('fetch')!({
        request: { url: new URL(path, scope).href, method, mode, headers },
        respondWith: (value: Promise<Response>) => { response = value; },
      });
      return response;
    },
  };
}

describe('offline service worker', () => {
  it('precaches the shell, JS, CSS, icons and fonts without forcing an update on open tabs', async () => {
    const app = worker();
    await app.lifecycle('install');
    const cache = [...app.entries.values()][0];
    expect([...cache.contents.keys()]).toEqual(resources.map((path) => `https://portfolio.example/cadencia/${path}`));
    const [requests] = cache.addAll.mock.calls[0];
    expect(requests.every((request) => request instanceof Request && request.cache === 'reload')).toBe(true);
    expect(app.skipWaiting).not.toHaveBeenCalled();
  });

  it('does not mix an old HTML from HTTP cache with scripts from the new release', async () => {
    const caches = makeCaches();
    caches.fetch.mockImplementation(async (request) => {
      const url = typeof request === 'string' ? request : request.url;
      const currentRelease = request instanceof Request && request.cache === 'reload';
      return new Response(url.endsWith('index.html') && !currentRelease ? 'old shell' : 'current release');
    });
    const app = worker({ caches });
    await app.lifecycle('install');
    const cache = [...app.entries.values()][0];
    expect(await cache.contents.get('https://portfolio.example/cadencia/index.html')!.text()).toBe('current release');
  });

  it('rejects an incomplete release while keeping the prior version available', async () => {
    const caches = makeCaches();
    const old = worker({ caches, version: 'old' });
    await old.lifecycle('install');
    const oldName = [...caches.entries.keys()][0];
    const update = worker({ caches, version: 'new' });
    caches.fetch.mockImplementation(async (request) => {
      const url = typeof request === 'string' ? request : request.url;
      return new Response('response', { status: url.endsWith('.woff2') ? 404 : 200 });
    });
    await expect(update.lifecycle('install')).rejects.toThrow(/unavailable/);
    expect(caches.entries.get(oldName)!.contents.size).toBe(resources.length);
    expect(update.claim).not.toHaveBeenCalled();
  });

  it('pins navigation to the installed shell even when the server has a newer release', async () => {
    const app = worker();
    await app.lifecycle('install');
    app.fetch.mockClear();
    app.fetch.mockResolvedValue(new Response('new online shell'));
    expect(await (await app.request('./', 'navigate'))!.text())
      .toBe('network: https://portfolio.example/cadencia/index.html');
    expect(app.fetch).not.toHaveBeenCalled();
    app.fetch.mockRejectedValue(new TypeError('Network unavailable'));
    expect(await (await app.request('./?view=library', 'navigate'))!.text())
      .toBe('network: https://portfolio.example/cadencia/index.html');
  });

  it('uses the network when the installed shell has been evicted', async () => {
    const app = worker();
    app.fetch.mockResolvedValue(new Response('Online shell'));
    const response = await app.request('./', 'navigate');
    expect(response!.status).toBe(200);
    expect(await response!.text()).toBe('Online shell');
  });

  it('returns a readable 503 if the cache was evicted and the network is unavailable', async () => {
    const app = worker();
    app.fetch.mockRejectedValue(new TypeError('Network unavailable'));
    const response = await app.request('./', 'navigate');
    expect(response!.status).toBe(503);
    expect(response!.headers.get('Content-Type')).toContain('text/plain');
    expect(await response!.text()).toContain('Conecte-se à internet');
  });

  it('loads hashed scripts, styles and fonts entirely from cache after disconnecting', async () => {
    const app = worker();
    await app.lifecycle('install');
    app.fetch.mockClear();
    app.fetch.mockRejectedValue(new TypeError('Network unavailable'));
    for (const path of resources.filter((path) => path.startsWith('assets/'))) {
      expect(await (await app.request(path))!.text()).toBe(`network: https://portfolio.example/cadencia/${path}`);
    }
    expect(app.fetch).not.toHaveBeenCalled();
  });

  it('serves static module requests offline despite a host Vary: Origin header', async () => {
    const caches = makeCaches();
    caches.fetch.mockImplementation(async () => new Response('static resource', { headers: { Vary: 'Origin' } }));
    const app = worker({ caches });
    await app.lifecycle('install');
    app.fetch.mockClear();
    app.fetch.mockRejectedValue(new TypeError('Network unavailable'));
    const headers = new Headers({ Origin: 'https://portfolio.example' });
    const cache = [...app.entries.values()][0];
    const request = { url: 'https://portfolio.example/cadencia/assets/app-a.js', method: 'GET', mode: 'cors', headers };
    // Normal Cache.match would miss because precaching did not send this Origin.
    expect(await cache.match(request)).toBeUndefined();
    expect(await (await app.request('assets/app-a.js', 'cors', 'GET', headers))!.text()).toBe('static resource');
    expect(cache.match).toHaveBeenLastCalledWith(request, { ignoreVary: true });
    expect(await (await app.request('./', 'navigate', 'GET', headers))!.text()).toBe('static resource');
    expect(cache.match).toHaveBeenLastCalledWith('https://portfolio.example/cadencia/index.html', { ignoreVary: true });
    expect(app.fetch).not.toHaveBeenCalled();
  });

  it('keeps a successful resource response usable when cache storage is full', async () => {
    const app = worker();
    await app.lifecycle('install');
    const cache = [...app.entries.values()][0];
    cache.contents.delete('https://portfolio.example/cadencia/assets/font-c.woff2');
    cache.put.mockRejectedValue(new DOMException('Cache full', 'QuotaExceededError'));
    expect((await app.request('assets/font-c.woff2'))!.status).toBe(200);
    expect(cache.put).toHaveBeenCalledOnce();
  });

  it('leaves cross-origin, out-of-scope, non-GET and unknown resource requests untouched', () => {
    const app = worker();
    for (const [url, mode, method] of [
      ['https://other.example/assets/app-a.js', 'cors', 'GET'],
      ['https://portfolio.example/another/', 'navigate', 'GET'],
      ['https://portfolio.example/cadencia-lookalike/', 'navigate', 'GET'],
      ['assets/app-a.js', 'cors', 'POST'],
      ['unrelated.json', 'cors', 'GET'],
    ]) expect(app.request(url, mode, method)).toBeUndefined();
    expect(app.fetch).not.toHaveBeenCalled();
  });

  it('removes only old releases in its own scope, including with a colon in a nested scope', async () => {
    const caches = makeCaches();
    for (const scope of ['https://portfolio.example/another/', 'https://portfolio.example/cadencia/:nested/']) {
      await worker({ caches, scope, version: 'other-project' }).lifecycle('install');
    }
    const otherNames = [...caches.entries.keys()];
    await caches.storage.open('another-application-cache');
    const old = worker({ caches, version: 'old' });
    await old.lifecycle('install');
    const oldName = [...caches.entries.keys()].find((name) => name.endsWith(':old'))!;
    const latest = worker({ caches, version: 'new' });
    await latest.lifecycle('install');
    await latest.lifecycle('activate');
    expect(caches.entries.has(oldName)).toBe(false);
    expect([...caches.entries.keys()]).toEqual(expect.arrayContaining([...otherNames, 'another-application-cache']));
    expect(caches.entries.size).toBe(otherNames.length + 2);
    expect(latest.claim).toHaveBeenCalledOnce();
  });
});

const temporaryDirectories: string[] = [];
afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    // Cleanup is constrained to directories created by this suite in the system temp folder.
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('cadencia-offline-')) {
      throw new Error('Refusing to remove a directory outside the test fixture location.');
    }
    await rm(directory, { recursive: true, force: true });
  }
});

async function buildFixture() {
  const cwd = await mkdtemp(join(tmpdir(), 'cadencia-offline-'));
  temporaryDirectories.push(cwd);
  await mkdir(join(cwd, 'public'));
  await mkdir(join(cwd, 'dist', 'assets'), { recursive: true });
  await writeFile(join(cwd, 'public', 'sw.js'), template);
  await writeFile(join(cwd, 'dist', 'index.html'), '<html>App shell</html>');
  await writeFile(join(cwd, 'dist', 'assets', 'app-a.js'), 'console.log("app")');
  await writeFile(join(cwd, 'dist', 'assets', 'font-c.woff2'), 'fixture-font');
  const build = async () => {
    await execute(process.execPath, [join(project, 'scripts/build-offline.mjs')], { cwd });
    return readFile(join(cwd, 'dist', 'sw.js'), 'utf8');
  };
  return { cwd, build };
}

describe('offline production build', () => {
  it('injects every output resource, replaces both tokens and produces a deterministic release', async () => {
    const fixture = await buildFixture();
    const built = await fixture.build();
    expect(built).not.toContain('self.__PRECACHE__');
    expect(built).not.toContain('self.__VERSION__');
    expect(built).toContain('"assets/font-c.woff2"');
    expect(built).toContain('"index.html"');
    expect(built).not.toContain('"sw.js"');
    expect(await fixture.build()).toBe(built);
  });

  it('changes release identity when a resource path changes without a content change', async () => {
    const fixture = await buildFixture();
    const before = await fixture.build();
    const oldFont = join(fixture.cwd, 'dist', 'assets', 'font-c.woff2');
    await writeFile(join(fixture.cwd, 'dist', 'assets', 'font-d.woff2'), await readFile(oldFont));
    await rm(oldFont);
    const after = await fixture.build();
    const version = (source: string) => source.match(/const VERSION = "([a-f0-9]+)"/)?.[1];
    expect(version(before)).toMatch(/^[a-f0-9]{16}$/);
    expect(version(after)).not.toBe(version(before));
  });

  it('fails explicitly when the shell or a build token is missing', async () => {
    const fixture = await buildFixture();
    await rm(join(fixture.cwd, 'dist', 'index.html'));
    await expect(fixture.build()).rejects.toThrow(/index.html/);
    await writeFile(join(fixture.cwd, 'dist', 'index.html'), '<html>App shell</html>');
    await writeFile(join(fixture.cwd, 'public', 'sw.js'), template.replace('self.__PRECACHE__', '[]'));
    await expect(fixture.build()).rejects.toThrow(/self.__PRECACHE__/);
  });
});
