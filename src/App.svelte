<script lang="ts">
  import { onMount } from 'svelte';
  import {
    addDays,
    dueCards,
    makeId,
    reviewCard,
    todayKey,
    type Card,
    type Deck,
    type Rating,
    type State,
  } from './lib/domain';
  import {
    loadState,
    parseBackup,
    saveState,
    serializeBackup,
  } from './lib/storage';
  import Icon from './components/Icon.svelte';
  import Dialog from './components/Dialog.svelte';
  import DeckEditor from './components/DeckEditor.svelte';
  import CardEditor from './components/CardEditor.svelte';
  import Study from './components/Study.svelte';

  type View = 'today' | 'decks' | 'progress' | 'data';
  let workspace = $state<State | null>(null);
  let loading = $state(true);
  let fatalError = $state('');
  let view = $state<View>('today');
  let date = $state(todayKey());
  let selectedDeckId = $state('');
  let search = $state('');
  let deckEditor = $state<{ deck?: Deck } | null>(null);
  let cardEditor = $state<{ card?: Card; deckId: string } | null>(null);
  let confirmation = $state<{
    title: string;
    body: string;
    label: string;
    danger?: boolean;
    action: () => Promise<void>;
  } | null>(null);
  let studyCards = $state<Card[] | null>(null);
  let notice = $state('');
  let noticeError = $state(false);
  let busy = $state(false);
  let offline = $state(false);
  let offlineReady = $state(false);
  let importInput = $state<HTMLInputElement>();
  const menu: { id: View; label: string }[] = [
    { id: 'today', label: 'Hoje' },
    { id: 'decks', label: 'Meus baralhos' },
    { id: 'progress', label: 'Meu progresso' },
    { id: 'data', label: 'Meus dados' },
  ];
  let due = $derived(workspace ? dueCards(workspace, date) : []);
  let studiedToday = $derived(
    workspace?.reviews.filter((r) => r.reviewedOn === date).length ?? 0,
  );
  let selectedDeck = $derived(
    workspace?.decks.find((d) => d.id === selectedDeckId),
  );
  let filteredCards = $derived(
    (workspace?.cards ?? []).filter(
      (c) =>
        (!selectedDeckId || c.deckId === selectedDeckId) &&
        `${c.front} ${c.back}`
          .toLocaleLowerCase('pt-BR')
          .includes(search.toLocaleLowerCase('pt-BR').trim()),
    ),
  );
  let week = $derived(
    Array.from({ length: 7 }, (_, i) => {
      const day = addDays(date, i - 6);
      return {
        date: day,
        count:
          workspace?.reviews.filter((r) => r.reviewedOn === day).length ?? 0,
      };
    }),
  );
  let weeklyTotal = $derived(week.reduce((sum, day) => sum + day.count, 0));
  let activeDays = $derived(week.filter((day) => day.count > 0).length);
  let solidCards = $derived(
    workspace?.cards.filter((c) => c.box >= 3).length ?? 0,
  );
  const formatDate = (
    value: string,
    options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' },
  ) =>
    new Intl.DateTimeFormat('pt-BR', options).format(
      new Date(`${value}T12:00:00`),
    );
  const deckFor = (id: string) => workspace?.decks.find((d) => d.id === id);
  const errorText = (error: unknown) =>
    error instanceof Error
      ? error.message
      : 'Algo deu errado. Tente novamente.';
  const plural = (count: number, singular: string, pluralForm: string) =>
    count === 1 ? singular : pluralForm;

  function notify(message: string, isError = false) {
    notice = message;
    noticeError = isError;
  }
  async function reload() {
    loading = true;
    fatalError = '';
    try {
      workspace = await loadState();
      notice = '';
      studyCards = null;
      date = todayKey();
    } catch (error) {
      fatalError = errorText(error);
    } finally {
      loading = false;
    }
  }
  onMount(() => {
    void reload();
    const updateConnection = () => {
      offline = !navigator.onLine;
    };
    const updateDate = () => {
      date = todayKey();
    };
    const updateWorker = () => {
      offlineReady = !!navigator.serviceWorker?.controller;
    };
    const workerFailed = () => {
      notify(
        'O acesso offline não pôde ser preparado. Você ainda pode usar o app nesta conexão.',
        true,
      );
    };
    updateConnection();
    updateWorker();
    const timer = window.setInterval(updateDate, 30_000);
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    window.addEventListener('offline-unavailable', workerFailed);
    document.addEventListener('visibilitychange', updateDate);
    navigator.serviceWorker?.addEventListener('controllerchange', updateWorker);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
      window.removeEventListener('offline-unavailable', workerFailed);
      document.removeEventListener('visibilitychange', updateDate);
      navigator.serviceWorker?.removeEventListener(
        'controllerchange',
        updateWorker,
      );
    };
  });
  function navigate(next: View) {
    view = next;
    studyCards = null;
    selectedDeckId = '';
    search = '';
  }
  function openDeck(id: string) {
    view = 'decks';
    selectedDeckId = id;
    search = '';
    studyCards = null;
  }
  function startStudy(deckId?: string) {
    if (!workspace) return;
    date = todayKey();
    const queue = dueCards(workspace, date, deckId);
    if (!queue.length) {
      notify('Tudo em dia neste baralho. Volte na próxima revisão.');
      return;
    }
    studyCards = structuredClone($state.snapshot(queue));
    notice = '';
  }
  async function persist(next: State, message?: string) {
    if (!workspace) throw new Error('Os dados ainda não foram carregados.');
    workspace = await saveState($state.snapshot(next), workspace.revision);
    if (message) notify(message);
  }
  async function saveDeck(data: Omit<Deck, 'id'>) {
    if (!workspace) return;
    const existing = deckEditor?.deck;
    const deck = { ...data, id: existing?.id ?? makeId() };
    await persist(
      {
        ...workspace,
        decks: existing
          ? workspace.decks.map((d) => (d.id === existing.id ? deck : d))
          : [...workspace.decks, deck],
      },
      'Baralho salvo.',
    );
  }
  async function saveCard(data: Pick<Card, 'front' | 'back' | 'deckId'>) {
    if (!workspace) return;
    const existing = cardEditor?.card;
    const card: Card = existing
      ? { ...existing, ...data }
      : {
          ...data,
          id: makeId(),
          box: 0,
          dueOn: todayKey(),
          createdOn: todayKey(),
        };
    await persist(
      {
        ...workspace,
        cards: existing
          ? workspace.cards.map((c) => (c.id === existing.id ? card : c))
          : [...workspace.cards, card],
      },
      'Cartão salvo.',
    );
  }
  function deleteCard(card: Card) {
    confirmation = {
      title: 'Excluir este cartão?',
      body: `“${card.front}” e seu histórico de revisões serão removidos. Essa ação não pode ser desfeita.`,
      label: 'Excluir cartão',
      danger: true,
      action: async () => {
        if (!workspace) return;
        await persist(
          {
            ...workspace,
            cards: workspace.cards.filter((c) => c.id !== card.id),
            reviews: workspace.reviews.filter((r) => r.cardId !== card.id),
          },
          'Cartão excluído.',
        );
      },
    };
  }
  function deleteDeck(deck: Deck) {
    const cardCount =
      workspace?.cards.filter((c) => c.deckId === deck.id).length ?? 0;
    confirmation = {
      title: 'Excluir este baralho?',
      body: `O baralho “${deck.name}”, ${cardCount} ${plural(cardCount, 'cartão', 'cartões')} e o histórico de revisões serão removidos. Exporte um backup antes se quiser preservar esses dados.`,
      label: 'Excluir baralho',
      danger: true,
      action: async () => {
        if (!workspace) return;
        await persist(
          {
            ...workspace,
            decks: workspace.decks.filter((d) => d.id !== deck.id),
            cards: workspace.cards.filter((c) => c.deckId !== deck.id),
            reviews: workspace.reviews.filter((r) => r.deckId !== deck.id),
          },
          'Baralho excluído.',
        );
        selectedDeckId = '';
      },
    };
  }
  async function confirmAction() {
    if (!confirmation || busy) return;
    busy = true;
    try {
      await confirmation.action();
      confirmation = null;
    } catch (error) {
      confirmation = null;
      notify(errorText(error), true);
    } finally {
      busy = false;
    }
  }
  async function recordReview(id: string, rating: Rating) {
    if (!workspace) return;
    date = todayKey();
    await persist(reviewCard($state.snapshot(workspace), id, rating, date));
  }
  function exportBackup() {
    if (!workspace) return;
    try {
      const blob = new Blob([serializeBackup($state.snapshot(workspace))], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cadencia-backup-${todayKey()}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      notify('Backup preparado. Confira o arquivo na pasta de downloads.');
    } catch (error) {
      notify(errorText(error), true);
    }
  }
  async function importBackup(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    const file = target.files?.[0];
    target.value = '';
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024)
        throw new Error('O backup deve ter no máximo 2 MiB.');
      const imported = parseBackup(await file.text());
      confirmation = {
        title: 'Restaurar este backup?',
        body: `O arquivo contém ${imported.decks.length} ${plural(imported.decks.length, 'baralho', 'baralhos')}, ${imported.cards.length} ${plural(imported.cards.length, 'cartão', 'cartões')} e ${imported.reviews.length} ${plural(imported.reviews.length, 'revisão', 'revisões')}. Eles substituirão todos os dados atuais deste navegador. Exporte seus dados atuais antes de continuar.`,
        label: 'Substituir e restaurar',
        action: async () => {
          await persist(
            imported,
            'Backup restaurado. Seus cartões estão prontos.',
          );
          selectedDeckId = '';
          search = '';
        },
      };
    } catch (error) {
      notify(errorText(error), true);
    }
  }
</script>

<svelte:head
  ><title
    >Cadência · {studyCards
      ? 'Revisão'
      : menu.find((item) => item.id === view)?.label}</title
  ></svelte:head
>

<a class="skip-link" href="#main">Pular para o conteúdo</a>
<div class="app-shell">
  <header class="masthead">
    <a
      class="brand"
      href="#main"
      onclick={() => navigate('today')}
      aria-label="Cadência, página inicial"
      ><img src="./icon.svg" alt="" width="38" height="38" /><span
        >cadência<span class="brand-dot">.</span></span
      ></a
    >
    <p class="brand-caption">ESTÚDIO DE MEMÓRIA</p>
    <nav aria-label="Navegação principal">
      {#each menu as item, index}<button
          class:active={view === item.id && !studyCards}
          aria-current={view === item.id && !studyCards ? 'page' : undefined}
          onclick={() => navigate(item.id)}
          ><span class="nav-index" aria-hidden="true">0{index + 1}</span><span
            >{item.label}</span
          >{#if item.id === 'today' && due.length}<span class="nav-count"
              >{due.length}</span
            >{/if}</button
        >{/each}
    </nav>
    <span class="masthead-note"
      ><span class="status-dot"></span> Feito para o seu ritmo.</span
    >
  </header>

  <div class="main-shell">
    <header class="topbar">
      <span class="breadcrumb"
        >Meu espaço <span>/</span>
        <strong
          >{studyCards
            ? 'Sessão de revisão'
            : menu.find((item) => item.id === view)?.label}</strong
        ></span
      ><span class="connection"
        ><Icon name="shield" size={15} />
        {offline ? 'Sem conexão' : 'Sem conta. No seu ritmo.'}</span
      >
    </header>
    <main id="main" tabindex="-1">
      {#if notice}<div
          class:error={noticeError}
          class="notice"
          role={noticeError ? 'alert' : 'status'}
        >
          <Icon name={noticeError ? 'archive' : 'check'} size={18} /><span
            >{notice}</span
          >{#if noticeError}<button
              class="text-button"
              onclick={() => void reload()}>Recarregar dados</button
            >{/if}<button
            class="icon-button"
            aria-label="Fechar mensagem"
            onclick={() => (notice = '')}
            ><Icon name="close" size={16} /></button
          >
        </div>{/if}
      {#if loading}<div class="empty-state" role="status">
          <span class="loading-ring"></span>
          <h1>Preparando seu espaço…</h1>
          <p>Carregando os cartões salvos neste navegador.</p>
        </div>
      {:else if fatalError}<div class="empty-state">
          <Icon name="archive" size={36} />
          <h1>Não foi possível abrir seus dados.</h1>
          <p role="alert">{fatalError}</p>
          <button class="button primary" onclick={() => void reload()}
            >Tentar novamente</button
          >
          <p class="small muted">Os dados existentes foram preservados.</p>
        </div>
      {:else if workspace}
        {#if studyCards}
          <Study
            cards={studyCards}
            decks={workspace.decks}
            {date}
            onreview={recordReview}
            onclose={() => {
              studyCards = null;
              view = 'today';
            }}
          />
        {:else if view === 'today'}
          <div class="page-title">
            <div>
              <p class="eyebrow">
                {formatDate(date, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </p>
              <h1>Seu treino de memória.</h1>
            </div>
            <button
              class="button secondary"
              onclick={() => {
                if (workspace!.decks.length)
                  cardEditor = { deckId: workspace!.decks[0].id };
                else deckEditor = {};
              }}><Icon name="plus" size={17} /> Novo cartão</button
            >
          </div>

          <section class="hero" aria-labelledby="hero-title">
            <div class="hero-content">
              <span class="hero-label"
                ><span class="status-dot"></span> APRENDER É VOLTAR ÀS BOAS IDEIAS</span
              >
              <h2 id="hero-title">
                Conhecimento<br />que <span class="headline-mark">fica.</span>
              </h2>
              <p>
                {due.length
                  ? `Você tem ${due.length} ${plural(due.length, 'cartão', 'cartões')} esperando uma nova visita. Reserve alguns minutos e fortaleça suas lembranças.`
                  : 'Seu dia está em dia. Aproveite a pausa ou crie um cartão sobre algo que acabou de aprender.'}
              </p>
              <button
                class="button primary"
                disabled={!due.length}
                onclick={() => startStudy()}
                >{due.length ? 'Começar revisão' : 'Revisões em dia'}<Icon
                  name={due.length ? 'arrow' : 'check'}
                  size={19}
                /></button
              ><span class="hero-hint"
                >{due.length
                  ? 'Sem cronômetro. Sem pressa.'
                  : 'As próximas revisões aparecem no dia certo.'}</span
              >
            </div>
            <div class="hero-art" aria-hidden="true">
              <div class="art-caption">
                <span>CADÊNCIA / PRÁTICA DIÁRIA</span><Icon
                  name="spark"
                  size={27}
                />
              </div>
              <div class="memory-stack">
                <div class="index-sheet sheet-back"></div>
                <div class="index-sheet sheet-middle"></div>
                <div class="index-sheet sheet-front">
                  <div class="sheet-heading">
                    <span>NOTA MENTAL</span><span>↗</span>
                  </div>
                  <p>Ler.<br />Lembrar.<br /><span>Repetir.</span></p>
                  <div class="sheet-footer">
                    <span>UMA IDEIA DE CADA VEZ</span><Icon
                      name="cards"
                      size={23}
                    />
                  </div>
                </div>
              </div>
              <div class="art-caption art-bottom">
                <span>PEQUENOS PASSOS, NOVAS CONEXÕES.</span><span>↻</span>
              </div>
            </div>
          </section>

          <section class="stat-grid" aria-label="Resumo dos estudos">
            <article class="stat-card">
              <span class="stat-icon sage"><Icon name="cards" /></span>
              <div>
                <p>Para revisar hoje</p>
                <strong
                  >{due.length}<span
                    >{plural(due.length, 'cartão', 'cartões')}</span
                  ></strong
                >
              </div>
              <span class="stat-detail"
                >{due.length
                  ? plural(due.length, 'Pronto para você', 'Prontos para você')
                  : 'Tudo em dia'}</span
              >
            </article>
            <article class="stat-card">
              <span class="stat-icon clay"><Icon name="check" /></span>
              <div>
                <p>{plural(studiedToday, 'Revisado hoje', 'Revisados hoje')}</p>
                <strong
                  >{studiedToday}<span
                    >{plural(studiedToday, 'cartão', 'cartões')}</span
                  ></strong
                >
              </div>
              <span class="stat-detail"
                >{studiedToday
                  ? 'Cada passo conta'
                  : 'Seu primeiro passo espera'}</span
              >
            </article>
            <article class="stat-card">
              <span class="stat-icon blue"><Icon name="book" /></span>
              <div>
                <p>Sua coleção</p>
                <strong
                  >{workspace.cards.length}<span
                    >{plural(workspace.cards.length, 'cartão', 'cartões')}</span
                  ></strong
                >
              </div>
              <span class="stat-detail"
                >em {workspace.decks.length}
                {plural(workspace.decks.length, 'baralho', 'baralhos')}</span
              >
            </article>
          </section>

          <div class="section-heading">
            <div>
              <h2>
                <span class="section-number" aria-hidden="true">01 /</span> Na sua
                mesa
              </h2>
              <p>Escolha um assunto e continue de onde parou.</p>
            </div>
            <button class="text-button" onclick={() => navigate('decks')}
              >Ver todos os baralhos <Icon name="arrow" size={16} /></button
            >
          </div>
          <div class="deck-grid">
            {#each workspace.decks.slice(0, 3) as deck}{@const total =
                workspace.cards.filter(
                  (c) => c.deckId === deck.id,
                ).length}{@const pending = due.filter(
                (c) => c.deckId === deck.id,
              ).length}
              <article class="deck-card" data-color={deck.color}>
                <div class="deck-top">
                  <span class="deck-icon {deck.color}"
                    ><Icon name="cards" size={24} /></span
                  ><span class="pill {pending ? deck.color : 'neutral'}"
                    >{pending ? `${pending} para hoje` : 'Em dia'}</span
                  >
                </div>
                <button class="deck-title" onclick={() => openDeck(deck.id)}
                  >{deck.name}</button
                >
                <p>{deck.description || 'Um novo espaço para suas ideias.'}</p>
                <div class="deck-progress" aria-hidden="true">
                  <span
                    class={deck.color}
                    style:width={`${total ? ((total - pending) / total) * 100 : 0}%`}
                  ></span>
                </div>
                <div class="deck-bottom">
                  <span>{total} {plural(total, 'cartão', 'cartões')}</span
                  ><button
                    class="text-button"
                    onclick={() => startStudy(deck.id)}
                    disabled={!pending}
                    >Revisar <Icon name="arrow" size={16} /></button
                  >
                </div>
              </article>{/each}
          </div>
          {#if !workspace.decks.length}<div class="empty-state compact">
              <Icon name="cards" size={32} />
              <h2>Seu primeiro assunto começa aqui.</h2>
              <p>Crie um baralho para reunir o que você quer aprender.</p>
              <button class="button primary" onclick={() => (deckEditor = {})}
                >Criar baralho</button
              >
            </div>{/if}
          <div class="gentle-note">
            <Icon name="spark" size={22} />
            <p>
              <strong>Consistência vale mais que quantidade.</strong> Cinco minutos
              de atenção já são um bom começo.
            </p>
            <span>VÁ NO SEU TEMPO</span>
          </div>
        {:else if view === 'decks'}
          <div class="page-title">
            <div>
              <p class="eyebrow">SUA BIBLIOTECA PESSOAL</p>
              <h1>{selectedDeck?.name ?? 'Um lugar para cada descoberta.'}</h1>
              <p class="muted">
                {selectedDeck?.description ??
                  'Organize suas ideias. Dê espaço para aprender.'}
              </p>
            </div>
            <button
              class="button primary"
              onclick={() => {
                if (selectedDeck) cardEditor = { deckId: selectedDeck.id };
                else deckEditor = {};
              }}
              ><Icon name="plus" size={17} />
              {selectedDeck ? 'Novo cartão' : 'Novo baralho'}</button
            >
          </div>
          {#if !selectedDeck}
            <div class="deck-grid library-grid">
              {#each workspace.decks as deck}{@const count =
                  workspace.cards.filter((c) => c.deckId === deck.id).length}
                <article class="deck-card" data-color={deck.color}>
                  <div class="deck-top">
                    <span class="deck-icon {deck.color}"
                      ><Icon name="cards" size={24} /></span
                    >
                    <div class="inline-actions">
                      <button
                        class="icon-button"
                        aria-label={`Editar baralho ${deck.name}`}
                        onclick={() => (deckEditor = { deck })}
                        ><Icon name="edit" size={17} /></button
                      ><button
                        class="icon-button"
                        aria-label={`Excluir baralho ${deck.name}`}
                        onclick={() => deleteDeck(deck)}
                        ><Icon name="trash" size={17} /></button
                      >
                    </div>
                  </div>
                  <button class="deck-title" onclick={() => openDeck(deck.id)}
                    >{deck.name}</button
                  >
                  <p>
                    {deck.description || 'Um novo espaço para suas ideias.'}
                  </p>
                  <div class="deck-bottom">
                    <span>{count} {plural(count, 'cartão', 'cartões')}</span
                    ><button
                      class="text-button"
                      onclick={() => openDeck(deck.id)}
                      >Abrir baralho <Icon name="arrow" size={16} /></button
                    >
                  </div>
                </article>{/each}
            </div>
          {:else}
            <div class="library-toolbar">
              <button class="text-button" onclick={() => (selectedDeckId = '')}
                ><Icon name="back" size={16} /> Todos os baralhos</button
              >
              <div class="inline-actions">
                <button
                  class="text-button"
                  onclick={() => (deckEditor = { deck: selectedDeck })}
                  ><Icon name="edit" size={16} /> Editar baralho</button
                ><button
                  class="text-button danger-text"
                  onclick={() => deleteDeck(selectedDeck!)}
                  ><Icon name="trash" size={16} /> Excluir</button
                ><button
                  class="button primary small-button"
                  disabled={!due.some((c) => c.deckId === selectedDeckId)}
                  onclick={() => startStudy(selectedDeckId)}
                  >Revisar baralho <Icon name="arrow" size={16} /></button
                >
              </div>
            </div>
          {/if}
          <section class="card-library">
            <div class="section-heading">
              <h2>
                {selectedDeck ? 'Cartões deste baralho' : 'Todos os cartões'}
                <span class="count-badge">{filteredCards.length}</span>
              </h2>
              <label class="search-field"
                ><Icon name="search" size={17} /><input
                  type="search"
                  bind:value={search}
                  placeholder="Buscar pergunta ou resposta"
                  aria-label="Buscar cartões"
                /></label
              >
            </div>
            {#if !filteredCards.length}<div class="empty-state compact">
                <Icon name="cards" size={32} />
                <h2>
                  {search
                    ? 'Nenhum cartão encontrado.'
                    : 'Toda descoberta começa com uma pergunta.'}
                </h2>
                <p>
                  {search
                    ? 'Tente uma palavra diferente ou limpe a busca.'
                    : 'Adicione o primeiro cartão e comece sua coleção.'}
                </p>
                {#if search}<button
                    class="button secondary"
                    onclick={() => (search = '')}>Limpar busca</button
                  >{:else if workspace.decks.length}<button
                    class="button primary"
                    onclick={() =>
                      (cardEditor = {
                        deckId: selectedDeckId || workspace!.decks[0].id,
                      })}>Criar cartão</button
                  >{:else}<button
                    class="button primary"
                    onclick={() => (deckEditor = {})}
                    >Criar primeiro baralho</button
                  >{/if}
              </div>
            {:else}<div class="card-list">
                {#each filteredCards as card}<article class="card-row">
                    <span class="mini-deck-icon {deckFor(card.deckId)?.color}"
                      ><Icon name="cards" size={18} /></span
                    >
                    <div class="card-copy">
                      <span class="small muted"
                        >{deckFor(card.deckId)?.name}</span
                      >
                      <h3>{card.front}</h3>
                      <details>
                        <summary>Ver resposta</summary>
                        <p>{card.back}</p>
                      </details>
                    </div>
                    <span class="pill {card.dueOn <= date ? 'sage' : 'neutral'}"
                      >{card.dueOn <= date
                        ? 'Para hoje'
                        : formatDate(card.dueOn)}</span
                    >
                    <div class="inline-actions">
                      <button
                        class="icon-button"
                        aria-label={`Editar cartão: ${card.front}`}
                        onclick={() =>
                          (cardEditor = { card, deckId: card.deckId })}
                        ><Icon name="edit" size={17} /></button
                      ><button
                        class="icon-button"
                        aria-label={`Excluir cartão: ${card.front}`}
                        onclick={() => deleteCard(card)}
                        ><Icon name="trash" size={17} /></button
                      >
                    </div>
                  </article>{/each}
              </div>{/if}
          </section>
        {:else if view === 'progress'}
          <div class="page-title">
            <div>
              <p class="eyebrow">CADA RETORNO CONTA</p>
              <h1>Veja o caminho que você está fazendo.</h1>
              <p class="muted">
                Um registro das suas revisões, sem competir com ninguém.
              </p>
            </div>
          </div>
          <section class="stat-grid">
            <article class="stat-card">
              <span class="stat-icon sage"><Icon name="check" /></span>
              <div>
                <p>Nos últimos 7 dias</p>
                <strong
                  >{weeklyTotal}<span
                    >{plural(weeklyTotal, 'revisão', 'revisões')}</span
                  ></strong
                >
              </div>
            </article>
            <article class="stat-card">
              <span class="stat-icon clay"><Icon name="sun" /></span>
              <div>
                <p>Dias com prática</p>
                <strong>{activeDays}<span>de 7 dias</span></strong>
              </div>
            </article>
            <article class="stat-card">
              <span class="stat-icon blue"><Icon name="leaf" /></span>
              <div>
                <p>Em intervalos longos</p>
                <strong
                  >{solidCards}<span
                    >{plural(solidCards, 'cartão', 'cartões')}</span
                  ></strong
                >
              </div>
            </article>
          </section>
          <div class="progress-grid">
            <section class="panel">
              <div class="section-heading">
                <div>
                  <h2>Seu ritmo na semana</h2>
                  <p>Cartões revisados por dia</p>
                </div>
                <span class="pill sage">Últimos 7 dias</span>
              </div>
              <div
                class="week-chart"
                role="img"
                aria-label={week
                  .map(
                    (day) =>
                      `${formatDate(day.date)}: ${day.count} ${plural(day.count, 'revisão', 'revisões')}`,
                  )
                  .join('; ')}
              >
                {#each week as day}<div class="chart-column">
                    <span>{day.count}</span>
                    <div class="bar-track">
                      <div
                        class:today={day.date === date}
                        style:height={`${day.count ? Math.max(4, (day.count / Math.max(1, ...week.map((d) => d.count))) * 100) : 2}%`}
                      ></div>
                    </div>
                    <span class:current-day={day.date === date}
                      >{day.date === date
                        ? 'Hoje'
                        : formatDate(day.date, { weekday: 'short' }).replace(
                            '.',
                            '',
                          )}</span
                    >
                  </div>{/each}
              </div>
              {#if !weeklyTotal}<p class="chart-empty">
                  O primeiro ponto da sua história aparece depois de uma
                  revisão.
                </p>{/if}
            </section>
            <section class="panel next-days">
              <span class="eyebrow">OLHANDO PARA A FRENTE</span>
              <h2>Próximas revisões</h2>
              <p class="muted">
                Datas atuais dos seus cartões. Elas mudam conforme você pratica.
              </p>
              {#each Array.from( { length: 5 }, (_, i) => addDays(date, i + 1) ) as day}{@const count =
                  workspace.cards.filter((c) => c.dueOn === day).length}
                <div>
                  <span
                    >{day === addDays(date, 1)
                      ? 'Amanhã'
                      : formatDate(day, {
                          weekday: 'long',
                          day: 'numeric',
                        })}</span
                  ><strong
                    >{count}<span>
                      {plural(count, 'cartão', 'cartões')}</span
                    ></strong
                  >
                </div>{/each}
            </section>
          </div>
          <section class="panel method-panel">
            <span class="stat-icon sage"><Icon name="leaf" size={26} /></span>
            <div>
              <h2>Revisar é dar tempo para lembrar.</h2>
              <p>
                A cada resposta, o cartão encontra seu próximo dia: 1, 3, 7, 14
                ou 30 dias depois. Se precisar rever, ele volta amanhã. Os
                intervalos são uma regra simples de estudo, não uma medida de
                quanto você aprendeu.
              </p>
              <p class="small muted">
                As estatísticas mostram o histórico dos cartões que ainda estão
                na sua coleção. Excluir cartões também remove suas revisões.
              </p>
            </div>
          </section>
        {:else if view === 'data'}
          <div class="page-title">
            <div>
              <p class="eyebrow">CUIDE DA SUA COLEÇÃO</p>
              <h1>Seu aprendizado vai com você.</h1>
              <p class="muted">
                Guarde uma cópia dos cartões e leve-a para outro navegador.
              </p>
            </div>
          </div>
          <div class="privacy-banner">
            <span class="stat-icon sage"><Icon name="shield" size={28} /></span>
            <div>
              <h2>Seus dados ficam aqui.</h2>
              <p>
                O Cadência salva seus estudos neste navegador. Não há conta,
                servidor de dados ou sincronização. Limpar os dados do site ou
                usar outro navegador cria um espaço separado.
              </p>
            </div>
          </div>
          <div class="backup-grid">
            <section class="panel backup-panel">
              <span class="backup-icon sage"
                ><Icon name="download" size={28} /></span
              >
              <h2>Uma cópia para guardar</h2>
              <p>
                Exporte seus baralhos, cartões e histórico de revisões em um
                arquivo JSON. Faça isso regularmente e guarde o arquivo em um
                lugar seguro.
              </p>
              <div class="backup-meta">
                {workspace.decks.length}
                {plural(workspace.decks.length, 'baralho', 'baralhos')}
                <span>·</span>
                {workspace.cards.length}
                {plural(workspace.cards.length, 'cartão', 'cartões')}
                <span>·</span>
                {workspace.reviews.length}
                {plural(workspace.reviews.length, 'revisão', 'revisões')}
              </div>
              <button class="button primary" onclick={exportBackup}
                ><Icon name="download" size={18} /> Exportar backup</button
              >
            </section>
            <section class="panel backup-panel">
              <span class="backup-icon clay"
                ><Icon name="upload" size={28} /></span
              >
              <h2>Continuar de onde parou</h2>
              <p>
                Escolha um backup do Cadência. O arquivo será validado antes de
                pedir sua confirmação. A restauração substitui a coleção atual
                inteira.
              </p>
              <div class="backup-meta">
                Arquivo .json <span>·</span> até 2 MiB
              </div>
              <input
                class="visually-hidden"
                type="file"
                accept=".json,application/json"
                bind:this={importInput}
                onchange={importBackup}
                aria-label="Selecionar arquivo de backup"
                tabindex="-1"
              /><button
                class="button secondary"
                onclick={() => importInput?.click()}
                ><Icon name="upload" size={18} /> Importar backup</button
              >
            </section>
          </div>
          <section class="panel offline-panel">
            <Icon name="leaf" size={25} />
            <div>
              <h2>
                {offlineReady
                  ? 'Pronto para estudar offline.'
                  : 'Acesso offline'}
              </h2>
              <p>
                {offlineReady
                  ? 'Este navegador já guardou o aplicativo. Seus cartões e revisões continuam funcionando sem internet.'
                  : 'Na versão de produção, o aplicativo é guardado após o primeiro acesso completo. O modo de desenvolvimento exige o servidor local.'}
                Atualizações entram ao fechar as abas do app e abrir novamente.
              </p>
            </div>
            <span class="pill {offlineReady ? 'sage' : 'neutral'}"
              >{offlineReady ? 'Disponível' : 'Ainda não preparado'}</span
            >
          </section>
          <p class="data-footnote">
            A coleção inicial tem 12 cartões de exemplo sobre programação. Você
            pode editar e excluir todos eles. Nenhuma revisão é inventada para
            preencher o progresso.
          </p>
        {/if}
        <footer class="app-footer">
          <span>cadência<span class="brand-dot">.</span></span>
          <p>Aprender tem seu próprio tempo.</p>
          <span>v1.0 · feito para continuar</span>
        </footer>
      {/if}
    </main>
  </div>
</div>

{#if deckEditor}<DeckEditor
    deck={deckEditor.deck}
    onsave={saveDeck}
    onclose={() => (deckEditor = null)}
  />{/if}
{#if cardEditor && workspace}<CardEditor
    card={cardEditor.card}
    decks={workspace.decks}
    initialDeckId={cardEditor.deckId}
    onsave={saveCard}
    onclose={() => (cardEditor = null)}
  />{/if}
{#if confirmation}<Dialog
    title={confirmation.title}
    onclose={() => {
      if (!busy) confirmation = null;
    }}
    ><p class="confirmation-copy">{confirmation.body}</p>
    <div class="dialog-actions">
      <button
        class="button secondary"
        disabled={busy}
        onclick={() => (confirmation = null)}>Cancelar</button
      ><button
        class="button"
        class:danger={confirmation.danger}
        class:primary={!confirmation.danger}
        disabled={busy}
        onclick={confirmAction}
        >{busy ? 'Salvando…' : confirmation.label}</button
      >
    </div></Dialog
  >{/if}
