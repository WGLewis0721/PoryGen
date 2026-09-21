const form = document.querySelector("#search-form");
const queryInput = document.querySelector("#query");
const status = document.querySelector("#status");
const results = document.querySelector("#results");

function escapeHtml(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderResults(data) {
  if (!data.results?.length) {
    const message = data.source === "web" && data.webConfigured === false
      ? "No local matches. Web fallback is ready in the code, but BRAVE_SEARCH_API_KEY is not configured."
      : "No results found.";
    results.innerHTML = `<p class="empty">${escapeHtml(message)}</p>`;
    return;
  }

  results.innerHTML = data.results.map((item, index) => {
    const local = item.source === "local";
    const meta = local
      ? `Local source · rank ${index + 1} · score ${item.score}`
      : `Web result · rank ${index + 1}`;

    return `
      <article class="result">
        <div class="meta">${escapeHtml(meta)}</div>
        <h2><a href="${escapeHtml(item.url)}" ${local ? "" : 'target="_blank" rel="noreferrer"'}>${escapeHtml(item.title)}</a></h2>
        <p>${escapeHtml(item.snippet || "")}</p>
      </article>
    `;
  }).join("");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const q = queryInput.value.trim();
  if (!q) return;

  status.textContent = "Searching 10 local sources…";
  results.innerHTML = "";

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Search failed.");

    status.textContent = data.source === "local"
      ? `Found matches in the local 10-source corpus. No web search needed.`
      : `No local match. Searched the web for up to 5 results.`;

    renderResults(data);
  } catch (error) {
    status.textContent = error.message || "Search failed.";
  }
});
