<script>
  import { onMount, onDestroy } from 'svelte';
  import { Client } from "@colyseus/sdk";

  let incrementer = 0;
  let room;
  let isConnected = $state(false);
  let roomState = $state({});
  let chatLog = $state([]);

  onMount(async () => {
    const serverURL = import.meta.env.PUBLIC_BACKEND_URL;

    if (!serverURL) {
      throw new Error("PUBLIC_BACKEND_URL missing from environment variables!");
    }

    try {
      const client = new Client(serverURL);
      room = await client.joinOrCreate("my_room");
      isConnected = true;

      room.onStateChange((state) => {
        roomState = state;
      });

      room.onMessage("yourMessageType", (message) => {
        chatLog = [...chatLog, message];
      })

    } catch (e) {
      console.error("Connection error", e);
    }
  });

  onDestroy(() => {
    if (room) {
      room.leave();
    }
  });

  function sendTestMessage() {
    if (room) {
      room.send("yourMessageType", { text: "Hello World! " + incrementer});
      incrementer++;
    }
  }
</script>

<div>
  <h2>Colyseus Test Room</h2>
  <p>
    Status:
    <span style="color: {isConnected ? 'green' : 'red'}">
      {isConnected ? "Connected" : "Disconnected"}
    </span>
  </p>

  {#if isConnected}
    <button onclick={sendTestMessage}>Send Message</button>

    <div>
      <h3>Current Room State:</h3>
      <pre>{JSON.stringify(roomState, null, 2)}</pre>
    </div>

    <ul>
      {#each chatLog as msg}
        <li>{msg.senderId}:{msg.text}</li>
      {/each}
    </ul>
  {/if}
</div>
