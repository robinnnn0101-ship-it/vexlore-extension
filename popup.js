const BOT_USERNAME = "vexlorebot";

document.getElementById("openBot").addEventListener("click", () => {
  const ca = document.getElementById("ca").value.trim();
  let url = "https://t.me/" + BOT_USERNAME;
  if (ca) {
    url += "?text=" + encodeURIComponent(ca);
  }
  chrome.tabs.create({ url });
});