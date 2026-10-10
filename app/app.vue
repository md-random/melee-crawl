<template>
  <NuxtPage />
</template>

<style>
:root {
  --bg: #1b1712;
  --panel: #26201a;
  --border: #3d332a;
  --fg: #e9e0cf;
  --muted: #a8998a;
  --accent: #f2c14e;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: 'Ubuntu', system-ui, sans-serif;
}

button,
input,
select {
  font: inherit;
  color: var(--fg);
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 10px;
}

button {
  cursor: pointer;
}

button:hover {
  border-color: var(--accent);
}
</style>
