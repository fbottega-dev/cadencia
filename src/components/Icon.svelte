<script lang="ts">
  let { name, size = 20 }: { name: string; size?: number } = $props();
  const paths: Record<string, string> = {
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',
    cards: 'm8 3 12 3-4 15-12-3L8 3ZM4 5l-2 13 11 3',
    chart: 'M4 3v17h17M8 15v-4m5 4V6m5 9V9',
    archive: 'M4 8h16v12H4V8Zm-1-5h18v5H3V3Zm6 9h6',
    arrow: 'M4 12h15m-6-6 6 6-6 6',
    plus: 'M12 5v14M5 12h14',
    search: 'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15M16 16l5 5',
    check: 'm5 12 4 4L19 6',
    close: 'm6 6 12 12M18 6 6 18',
    edit: 'm15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z',
    trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
    download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
    upload: 'M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5',
    shield: 'm12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Zm-4 9 3 3 5-5',
    book: 'M12 5C8 2 4 3 2 4v15c4-2 7-1 10 1m0-15c4-3 8-2 10-1v15c-4-2-7-1-10 1V5Z',
    clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 4v5l3 2',
    spark: 'm12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z',
    back: 'M20 12H5m6-6-6 6 6 6',
    leaf: 'M5 19c-6-11 4-16 15-16 0 11-3 19-15 16Zm-2 3L15 10',
  };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.65"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"><path d={paths[name] || paths.cards} /></svg
>
