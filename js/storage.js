const GITHUB_USER = "alknopfler";
const GITHUB_REPO = "web-alktaller";
const GITHUB_PATH = "data/car-data.json";

let githubSha = null;

function getToken() { return sessionStorage.getItem("githubToken"); }
function setToken(token) { sessionStorage.setItem("githubToken", token); }
function logout() { sessionStorage.removeItem("githubToken"); location.reload(); }

async function validateToken(token) {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }
    });
    if (!res.ok) return false;
    const user = await res.json();
    return user.login === GITHUB_USER;
  } catch (e) {
    return false;
  }
}

// UI Handler for Login Button
async function handleLogin() {
  const input = document.getElementById("githubTokenInput");
  const token = input.value.trim();
  if(!token) { alert("Introduce el token"); return; }
  
  const valid = await validateToken(token);
  if(!valid) { alert("Token inválido o usuario incorrecto (debe ser alktaller)"); return; }
  
  setToken(token);
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app-container").classList.remove("hidden");
  
  if(window.startApp) window.startApp();
}

async function loadData() {
  const token = getToken();
  if (!token) throw new Error("No authorized");
  
  const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${GITHUB_PATH}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } });
  
  if (res.status === 401) {
    alert("Sesión expirada");
    logout();
    return { vehicles: [] };
  }
  
  if (!res.ok) return { vehicles: [] };
  const file = await res.json();
  githubSha = file.sha;
  
  try {
    // Decodificar Base64 soportando caracteres UTF-8 (emojis, acentos)
    // El proceso inverso a btoa(unescape(encodeURIComponent(str))) es:
    const rawContent = file.content.replace(/\n/g, "");
    const decodedContent = decodeURIComponent(escape(window.atob(rawContent)));
    return JSON.parse(decodedContent);
  } catch (e) {
    console.error("Error al parsear el fichero JSON de GitHub", e);
    alert("Error: El archivo de datos en GitHub parece estar corrupto o tiene un formato inválido.");
    return { vehicles: [] };
  }
}

async function saveData(data) {
  const token = getToken();
  const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${GITHUB_PATH}`;
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
  
  // Si tenemos githubSha le mandamos, si no, es creacion
  const body = { 
    message: "Update via AlkTaller Web", 
    content, 
    ...(githubSha ? { sha: githubSha } : {}) 
  };
  
  // Feedback visual simple
  const oldText = document.body.style.cursor;
  document.body.style.cursor = 'wait';
  
  try {
    const res = await fetch(url, { 
      method: "PUT", 
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }, 
      body: JSON.stringify(body) 
    });
    
    if (!res.ok) {
       const err = await res.json().catch(()=>({}));
       console.error("Error GitHub:", err);
       alert(`Error al guardar: ${err.message || res.statusText}`); 
       return; 
    }
    
    const result = await res.json();
    githubSha = result.content.sha;
    // Opcional: toast notification en lugar de alert
    console.log("Guardado exitosamente", githubSha);
  } catch(e) {
    console.error(e);
    alert("Error de red al guardar");
  } finally {
    document.body.style.cursor = oldText;
  }
}
