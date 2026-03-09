/**
 * src/routes/+page.svelte
 *
 * Temporary test page to trigger the dev morale processing endpoint.
 */
<script lang="ts">
  /**
   * testMoraleProcessing
   * Trigger dev morale processing endpoint with a sample game date.
   */
  async function testMoraleProcessing() {
    const response = await fetch('/api/dev/process-morale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameDate: '2026-03-07' })
    })

    const result = await response.json()
    console.log(result)
    alert(JSON.stringify(result))
  }
</script>

<button on:click={testMoraleProcessing}>
  Test morale processing
</button>