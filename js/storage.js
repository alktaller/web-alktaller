const GITHUB_USER = "alktaller";
const GITHUB_REPO = "web-alktaller";
const GITHUB_PATH = "data/car-data.json";

let githubSha = null;

function getToken() { return sessionStorage.getItem("githubToken"); }
function setToken(token) { sessionStorage.setItem("githubToken", token); }
function logout() { sessionStorage.removeItem("githubToken"); location.reload(); }

async function validateToken(token) {
  const res = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }
  });
  if (!res.ok) return false;
  const user = await res.json();
  return user.login === GITHUB_USER;
}

async function ensureLogin() {
  let token = getToken();
  if (!token) {
    token = prompt("Password (GitHub token):");
    if (!token) throw new Error("Sin token");
    const valid = await validateToken(token);
    if (!valid) { alert("Token inválido"); throw new Error("Token inválido"); }
    setToken(token);
  }
  return token;
}

async function loadData() {
  const token = await ensureLogin();
  const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${GITHUB_PATH}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } });
  if (!res.ok) return { vehicles: [] };
  const file = await res.json();
  githubSha = file.sha;
  return JSON.parse(atob(file.content.replace(/\n/g, "")));
}

async function saveData(data) {
  const token = getToken();
  const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${GITHUB_PATH}`;
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
  const body = { message: "Update car data", content, sha: githubSha };
  const res = await fetch(url, { method: "PUT", headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }, body: JSON.stringify(body) });
  if (!res.ok) { console.error("Error guardando"); return; }
  const result = await res.json();
  githubSha = result.content.sha;
}
