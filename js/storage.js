// Configuración por defecto (fallback)
const DEFAULT_USER = "alktaller";
const DEFAULT_REPO = "web-alktaller";
const GITHUB_PATH = "data/car-data.json";

let githubSha = null;

// Funciones para obtener configuración desde Session/URL/Defaults
function getGithubUser() { 
  return sessionStorage.getItem("githubUser") || DEFAULT_USER; 
}

function getGithubRepo() { 
  return sessionStorage.getItem("githubRepo") || DEFAULT_REPO; 
}

function getToken() { return sessionStorage.getItem("githubToken"); }
function setToken(token) { sessionStorage.setItem("githubToken", token); }

function logout() { 
  sessionStorage.removeItem("githubToken"); 
  sessionStorage.removeItem("githubUser"); 
  sessionStorage.removeItem("githubRepo"); 
  location.reload(); 
}

// Intentar autodetectar repositorio desde la URL (para GitHub Pages)
function autoDetectConfig() {
  const host = window.location.hostname; // ej: usuario.github.io
  const path = window.location.pathname; // ej: /web-alktaller/
  
  if (host.includes("github.io")) {
    const user = host.split(".")[0];
    const repo = path.split("/")[1] || ""; // puede ser vacio si es root
    
    if (user && repo) {
      document.getElementById("repoUser").value = user;
      document.getElementById("repoName").value = repo;
    }
  } else {
     // Localhost o dominio custom: Usemos los defaults
     document.getElementById("repoUser").value = DEFAULT_USER;
     document.getElementById("repoName").value = DEFAULT_REPO;
  }
  
  // Si ya hay valores en session, ponerlos en los inputs
  if(sessionStorage.getItem("githubUser")) document.getElementById("repoUser").value = sessionStorage.getItem("githubUser");
  if(sessionStorage.getItem("githubRepo")) document.getElementById("repoName").value = sessionStorage.getItem("githubRepo");
}

async function validateToken(token) {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

// UI Handler for Login Button
async function handleLogin() {
  const input = document.getElementById("githubTokenInput");
  const userParam = document.getElementById("repoUser").value.trim();
  const repoParam = document.getElementById("repoName").value.trim();
  const token = input.value.trim();
  
  if(!token || !userParam || !repoParam) { alert("Rellena todos los campos (Usuario, Repo y Token)"); return; }
  
  const valid = await validateToken(token);
  if(!valid) { alert("Token inválido. Comprueba que lo has copiado bien."); return; }
  
  // Guardamos configuración
  setToken(token);
  sessionStorage.setItem("githubUser", userParam);
  sessionStorage.setItem("githubRepo", repoParam);
  
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app-container").classList.remove("hidden");
  
  if(window.startApp) window.startApp();
}

async function loadData() {
  const token = getToken();
  if (!token) throw new Error("No authorized");
  
  const user = getGithubUser();
  const repo = getGithubRepo();
  const url = `https://api.github.com/repos/${user}/${repo}/contents/${GITHUB_PATH}`;
  
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } });
  
  if (res.status === 401) {
    alert("Sesión expirada o sin permisos");
    logout();
    return { vehicles: [] };
  }
  
  if (res.status === 404) {
      // Puede ser que el archivo no exista (vehiculos vacios) O que el repo no exista.
      // Asumiremos que es vehiculos vacios para permitir creación.
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
  const user = getGithubUser();
  const repo = getGithubRepo();
  const url = `https://api.github.com/repos/${user}/${repo}/contents/${GITHUB_PATH}`;
  
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
       alert(`Error al guardar en ${user}/${repo}: ${err.message || res.statusText}`); 
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

// Init Check
document.addEventListener("DOMContentLoaded", ()=>{
   // Si estamos en la pantalla de login, intentar autodetectar
   if(!getToken()) {
       autoDetectConfig();
   }
});