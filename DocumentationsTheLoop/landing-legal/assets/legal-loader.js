/**
 * Textes légaux : source unique = table Supabase app_legal_content (même texte que l'app).
 * Le contenu HTML de la page reste affiché si la base est injoignable.
 * <article data-legal-key="cgu"> · <p data-legal-updated> · <h1 data-legal-title>
 */
(function () {
  var SUPABASE_URL = "https://eeyhtulpixvftvhppinz.supabase.co";
  var SUPABASE_KEY = "sb_publishable_l78zClzs1ldqOElbaLVT0w__KrKrlZv";

  var article = document.querySelector("[data-legal-key]");
  if (!article || !window.fetch) return;
  var key = article.getAttribute("data-legal-key");

  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function linkify(s) {
    return s
      .replace(/\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/gi, '<a href="mailto:$1">$1</a>')
      .replace(/\b(www\.theloop-app\.com(\/[a-z-]*)?)/gi, '<a href="https://$1">$1</a>')
      .replace(/\+224 626 68 06 06/g, '<a href="tel:+224626680606">+224 626 68 06 06</a>');
  }

  function isHeading(line, blockLength) {
    if (blockLength < 2) return false;
    if (/^\d+\.\s/.test(line)) return true;
    return line.length <= 60 && !/[.:;!?]$/.test(line);
  }

  function render(body) {
    return body
      .replace(/\r\n/g, "\n")
      .trim()
      .split(/\n{2,}/)
      .map(function (block) {
        var lines = block.split("\n").map(function (l) {
          var t = l.trim();
          return t.indexOf("- ") === 0 ? "• " + t.slice(2) : t;
        });
        var html = lines.map(function (l) { return linkify(escapeHtml(l)); });
        if (isHeading(lines[0], lines.length)) {
          return "<p><strong>" + html[0] + "</strong><br/>\n" + html.slice(1).join("<br/>\n") + "</p>";
        }
        return "<p>" + html.join("<br/>\n") + "</p>";
      })
      .join("\n\n");
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  }

  fetch(
    SUPABASE_URL + "/rest/v1/app_legal_content?select=title,body,updated_at&key=eq." + encodeURIComponent(key),
    { headers: { apikey: SUPABASE_KEY, Accept: "application/json" } }
  )
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (rows) {
      var row = rows && rows[0];
      if (!row || !row.body || !row.body.trim()) return;
      article.innerHTML = render(row.body);
      var updated = document.querySelector("[data-legal-updated]");
      var date = formatDate(row.updated_at);
      if (updated && date) updated.textContent = "Dernière mise à jour : " + date;
      var title = document.querySelector("[data-legal-title]");
      if (title && row.title) title.textContent = row.title;
    })
    .catch(function () {});
})();
