<!-- src/components/live/PageView.svelte -->
<!-- A page of a live lesson with its ink: a slide (or a blank blackboard) and the teacher's strokes. -->
<!-- Asks the ink store for the page's ink when it is shown. `children` goes on top (the presenter's pen). -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Page } from '../../lib/lesson/room.ts';
  import type { InkStore } from '../../lib/lesson/inkStore.svelte.ts';
  import SlideView from '../teach/SlideView.svelte';
  import InkLayer from './InkLayer.svelte';

  let {
    page,
    ink = null,
    framed = true,
    children
  }: { page: Page; ink?: InkStore | null; framed?: boolean; children?: Snippet } = $props();

  $effect(() => {
    ink?.want(page.id);
  });
</script>

<SlideView markdown={page.markdown} {framed}>
  <InkLayer strokes={ink?.strokes(page.id) ?? []} drawing={ink?.drawing(page.id) ?? []} />
  {@render children?.()}
</SlideView>
