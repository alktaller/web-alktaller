// Configuración Fija
const GITHUB_USER = "alktaller";
const GITHUB_REPO = "mis-datos-coche";
const GITHUB_PATH = "data/car-data.json";

let githubSha = null;

function getToken() { return sessionStorage.getItem("githubToken"); }
function setToken(token) { sessionStorage.setItem("githubToken", token); }

function logout() { 
  sessionStorage.removeItem("githubToken"); 
  location.reload(); 
}

async function validateToken(token) {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }
    });
    
    if (!res.ok) {
       console.error("Token validation failed:", res.status, res.statusText);
       return { valid: false, reason: `GitHub API error: ${res.status} ${res.statusText}` };
    }
    
    const user = await res.json();
    return { valid: true, login: user.login };
  } catch (e) {
    console.error("Token validation network error:", e);
    return { valid: false, reason: "Error de red al conectar con GitHub" };
  }
}

// UI Handler for Login Button
async function handleLogin() {
  const input = document.getElementById("githubTokenInput");
  const token = input.value.trim();
  
  if(!token) { alert("Introduce el token"); return; }
  
  const result = await validateToken(token);
  if(!result.valid) { 
      alert(`Token inválido.\nDetalles: ${result.reason}\n\nNota: Si usas una Organización, asegúrate de haber pulsado "Configure SSO" en tu token.`); 
      return; 
  }
  
  // Guardamos configuración
  setToken(token);
  
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app-container").classList.remove("hidden");
  
  // Feedback visual
  console.log(`Logueado como ${result.login}`);
  
  if(window.startApp) window.startApp();
}

async function loadData() {
  const token = getToken();
  if (!token) throw new Error("No authorized");
  
  const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${GITHUB_PATH}`;
  
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } });
  
  if (res.status === 401) {
    alert("Token expirado o sin permisos para acceder al repositorio privado.");
    logout();
    return { vehicles: [] };
  }
  
  if (res.status === 404) {
      // Repositorio privado existe pero el archivo no (primera vez)
      console.warn("Archivo data no encontrado (404), iniciando app vacía.");
      return { vehicles: [] };
  }
  
  if (!res.ok) return { vehicles: [] };
  
  const file = await res.json();
  githubSha = file.sha;
  
  try {
    const rawContent = file.content.replace(/\n/g, "");
    const decodedContent = decodeURIComponent(escape(window.atob(rawContent)));
    return JSON.parse(decodedContent);
  } catch (e) {
    console.error("Error al parsear el fichero JSON de GitHub", e);
    return { vehicles: [] };
  }
}

async function saveData(data) {
  const token = getToken();
  const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${GITHUB_PATH}`;
  
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
  
  const body = { 
    message: "Update via AlkTaller Web", 
    content, 
    ...(githubSha ? { sha: githubSha } : {}) 
  };
  
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
    console.log("Guardado exitosamente", githubSha);
  } catch(e) {
    console.error(e);
    alert("Error de red al guardar");
  } finally {
    document.body.style.cursor = oldText;
  }
}

// Init Check -> No necesitamos autodetect config
