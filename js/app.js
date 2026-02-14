let data; let currentVehicle;
let editState = null; // { type: 'fuel'|'maintenance', index: number }
let currentReminderSort = 'urgency'; // 'urgency' | 'alpha' | 'date_asc' | 'date_desc'
let currentHistorySort = 'date_desc'; // 'date_desc' | 'date_asc' | 'cost_desc' | 'cost_asc'

const DEFAULT_CATEGORIES = [
  "Filtro Aire", "Filtro Aceite", "Aceite Motor", "Líquido de Frenos",
  "Filtro Habitáculo", "Filtro Combustible", "Correa de Distribución", "ITV",
  "Líquido de Caja de Cambios", "Líquido de Diferenciales", "Aditivos",
  "Ruedas Delanteras", "Ruedas Traseras", "Reparación Pinchazo", "Inflado Neumáticos",
  "Bujías", "Suspensiones Delanteras", "Suspensiones Traseras",
  "Pastillas Freno Delanteras", "Pastillas Freno Traseras",
  "Discos Freno Delanteros", "Discos Freno Traseros",
  "Líquido Anticongelante", "Líquido de Dirección", "Limpiaparabrisas",
  "Luces", "Motor de arranque", "Inyectores"
];

async function start() {
  data = await loadData();
  // Validar estructura de data
  if (!data || typeof data !== 'object') data = { vehicles: [] };
  if (!data.vehicles) data.vehicles = [];
  
  // Garantizar lista de categorías
  if (!data.categories) data.categories = [...DEFAULT_CATEGORIES];
  else {
      // Merge por si acaso añadimos nuevas por defecto en el futuro que el usuario no tenga
      // aunque de momento respetamos las suyas.
      // Opcional: data.categories = [...new Set([...data.categories, ...DEFAULT_CATEGORIES])];
  }

  if (data.vehicles.length === 0){
    // Si no hay vehículos, pedir crear uno, pero esperar a que termine para seguir
    await addVehicle(true); 
    return;
  }
  
  // Seleccionar el primero por defecto si no hay uno seleccionado o no existe
  if (!currentVehicle || !data.vehicles.find(v => v.id === currentVehicle.id)) {
      currentVehicle = data.vehicles[0];
  }
  
  init();
}

function init(){ 
  renderCategoriesDatalist();
  renderVehicleSelect(); 
  // Load Settings
  if(data.settings && data.settings.ntfyTopic) {
      const el = document.getElementById("configNtfy");
      if(el) el.value = data.settings.ntfyTopic;
  }
  
  renderVehicleInfo(); // Nueva función
  renderTimeline(); 
  renderReminders(); 
  renderStats(); 
}

function updateSettings(key, value) {
    if(!data.settings) data.settings = {};
    data.settings[key] = value.trim();
    saveData(data);
}

async function testNotifications() {
    // 1. Get Token
    const token = sessionStorage.getItem("githubToken");
    if (!token) {
        alert("Error: No hay token de sesión. Recarga la página.");
        return;
    }

    // 2. Confirm
    if(!confirm("Esto lanzará una prueba de notificaciones AHORA MISMO. \n\nAsegúrate de haber guardado el Topic primero.\n¿Continuar?")) return;

    // 3. Call GitHub API to dispatch workflow
    try {
        const btn = document.getElementById('btnTestNtfy');
        if(btn) {
            btn.innerHTML = "Lanzando... ⏳";
            btn.disabled = true;
        }

        // El workflow está en el repositorio de la web, no necesariamente en el de datos
        const workflowRepo = "web-alktaller"; 

        const res = await fetch(`https://api.github.com/repos/${GITHUB_USER}/${workflowRepo}/actions/workflows/reminders.yml/dispatches`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ref: 'main' // Branch to run
            })
        });

        if (res.ok) {
            alert("✅ Prueba lanzada correctamente.\n\nRecibirás la notificación en unos segundos/minutos (dependiendo de la cola de GitHub).");
        } else {
            const err = await res.json();
            throw new Error(err.message || res.statusText);
        }
    } catch (e) {
        console.error(e);
        alert("❌ Error lanzando la prueba: " + e.message);
    } finally {
        const btn = document.getElementById('btnTestNtfy');
        if(btn) {
            btn.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg> Lanzar Prueba de Notificación`;
            btn.disabled = false;
        }
    }
}

function toggleConfig() {
    const el = document.getElementById("configPanel");
    if(el) {
        if (el.style.display === "none") {
            el.style.display = "block";
            el.scrollIntoView({behavior: "smooth"});
        } else {
            el.style.display = "none";
        }
    }
}

function renderCategoriesDatalist() {
    // Populate the dropdown select for new maintenance
    let select = document.getElementById("maintTypeSelect");
    if(select) {
        select.innerHTML = `<option value="" disabled selected>Seleccionar Tipo...</option>`;
        data.categories.sort().forEach(cat => {
            const opt = document.createElement("option");
            opt.value = cat;
            opt.textContent = cat;
            select.appendChild(opt);
        });
        
        // Add "Other" explicitly to clear input focus
        const other = document.createElement("option");
        other.value = "";
        other.textContent = "✏️ Otro (Escribir manual)...";
        select.appendChild(other);
    }
}

function checkAndAddCategory(newCat) {
    if(!newCat) return;
    const catFormatted = newCat.trim();
    // Case insensitive check
    const exists = data.categories.some(c => c.toLowerCase() === catFormatted.toLowerCase());
    if(!exists) {
        data.categories.push(catFormatted);
        renderCategoriesDatalist();
        // save happen in the caller function
    }
}

function renderVehicleSelect() {
  const select=document.getElementById("vehicleSelect"); select.innerHTML="";
  data.vehicles.forEach(v=>{ const opt=document.createElement("option"); opt.value=v.id; opt.textContent=v.name; select.appendChild(opt); });
  if (currentVehicle) select.value=currentVehicle.id;
  
  select.onchange=()=>{ 
      currentVehicle=data.vehicles.find(v=>v.id===select.value); 
      renderVehicleInfo(); // Actualizar info al cambiar coche
      renderTimeline(); renderReminders(); renderStats(); 
  };
}

// --- NUEVA LÓGICA DE INFORMACIÓN DE VEHÍCULO ---

// Helper para cargar imagen privada
async function loadImageSecurely(url, imgElement) {
    if (!url) return;
    
    // Si es un blob local (recién subido u optimizado), usar directo
    if (url.startsWith('blob:')) {
        imgElement.src = url;
        return;
    }

    try {
        const token = sessionStorage.getItem("githubToken");
        
        // Si no es de github, usar directo
        if (!url.includes('github') || !token) {
            imgElement.src = url;
            return;
        }

        const headers = { 'Authorization': `Bearer ${token}` };
        
        // Si es URL de API, pedir formato RAW
        if (url.includes('api.github.com')) {
            headers['Accept'] = 'application/vnd.github.v3.raw';
        }

        const res = await fetch(url, { headers });

        if (res.ok) {
            const blob = await res.blob();
            const fieldUrl = URL.createObjectURL(blob);
            imgElement.src = fieldUrl;
        } else {
            console.warn("Fallo cargando imagen segura", res.status);
            // Fallback con token en URL si fuera posible o URL directa
            imgElement.src = url; 
        }
    } catch (e) {
        console.error("Error cargando imagen segura", e);
        imgElement.src = url;
    }
}

function renderVehicleInfo() {
  if(!currentVehicle) return;
  
  // Rellenar campos, usando string vacio si no existen
  document.getElementById("infoPlate").value = currentVehicle.plate || "";
  document.getElementById("infoVin").value = currentVehicle.vin || "";
  document.getElementById("infoRegDate").value = currentVehicle.regDate || "";
  document.getElementById("infoPurchaseDate").value = currentVehicle.purchaseDate || "";
  document.getElementById("infoNotes").value = currentVehicle.notes || "";
  
  // Seguros
  document.getElementById("infoInsuranceCompany").value = currentVehicle.insuranceCompany || "";
  document.getElementById("infoInsurancePolicy").value = currentVehicle.insurancePolicy || "";

  // Foto del vehículo
  const imgPhoto = document.getElementById("vehiclePhotoImg");
  const svgPlaceholder = document.getElementById("vehiclePhotoPlaceholder");
  
  if (imgPhoto && svgPlaceholder) {
      if (currentVehicle.photo) {
          // Usar carga segura para repos privados
          loadImageSecurely(currentVehicle.photo, imgPhoto);
          imgPhoto.style.display = "block";
          svgPlaceholder.style.display = "none";
      } else {
          imgPhoto.style.display = "none";
          svgPlaceholder.style.display = "block";
      }
  }

  const linkPolicy = document.getElementById("linkViewPolicy");
  if (linkPolicy) {
      if(currentVehicle.insuranceFile) {
          linkPolicy.href = currentVehicle.insuranceFile;
          linkPolicy.style.display = "inline-flex"; 
          linkPolicy.innerHTML = `📄 Ver Póliza`;
      } else {
          linkPolicy.style.display = "none";
      }
  }

  // Kilometraje: Si no tiene campo propio, usamos el calculado, y lo guardamos
  if (currentVehicle.currentOdometer === undefined) {
      currentVehicle.currentOdometer = calculateMaxOdometer();
  }
  document.getElementById("infoOdo").value = currentVehicle.currentOdometer;

  // Set default dates for new Actions if empty
  const todayVal = new Date().toISOString().split('T')[0];
  const fuelDate = document.getElementById("fuelDate");
  const maintDate = document.getElementById("maintDate");
  if(fuelDate && !fuelDate.value) fuelDate.value = todayVal;
  if(maintDate && !maintDate.value) maintDate.value = todayVal;
}

async function uploadVehiclePolicy(input) {
    if(!currentVehicle) return;
    if(input.files && input.files[0]) {
        try {
            document.getElementById('uploadStatus').textContent = "Subiendo...";
            const result = await uploadImage(input.files[0]);
            currentVehicle.insuranceFile = result.url;
            await saveData(data);
            document.getElementById('uploadStatus').textContent = "✅ Guardado";
            renderVehicleInfo();
        } catch(e) {
            alert("Error subiendo: " + e.message);
            document.getElementById('uploadStatus').textContent = "Error";
        }
    }
}

async function uploadVehiclePhoto(input) {
    if(!currentVehicle) return;
    if(input.files && input.files[0]) {
        try {
            document.getElementById('vehiclePhotoStatus').textContent = "Subiendo foto...";
            const result = await uploadImage(input.files[0]);
            // Usamos api_url para asegurar acceso con token via API raw media type
            currentVehicle.photo = result.api_url;
            await saveData(data);
            document.getElementById('vehiclePhotoStatus').textContent = "";
            renderVehicleInfo();
        } catch(e) {
            alert("Error al subir foto: " + e.message);
            document.getElementById('vehiclePhotoStatus').textContent = "❌ Error";
        }
    }
}

async function updateVehicleInfo(field, value) {
  if(!currentVehicle) return;
  currentVehicle[field] = value;
  await saveData(data);
}

async function updateVehicleOdometer(value) {
  if(!currentVehicle) return;
  const newOdo = Number(value);
  if(isNaN(newOdo)) { alert("Kilometraje inválido"); return; }
  
  // Validar lógica básica? (no permitir bajar km salvo error?) -> Dejamos libre por si corrección de error
  currentVehicle.currentOdometer = newOdo;
  await saveData(data);
  renderStats(); // Los stats pueden cambiar si el odometro actual es la referencia
}

function calculateMaxOdometer() {
    // Busca el máximo entre fuel, maintenance y el propio currentOdometer
    if(!currentVehicle) return 0;
    
    let max = currentVehicle.currentOdometer || 0;
    
    currentVehicle.fuelEntries.forEach(e => { if(e.odometer > max) max = e.odometer; });
    currentVehicle.maintenanceEntries.forEach(e => { if(e.odometer > max) max = e.odometer; });
    
    return max;
}

// Función auxiliar para actualizar odómetro automáticamente desde entradas
function checkAndUpdateOdometer(newKm) {
    if(!currentVehicle.currentOdometer || newKm > currentVehicle.currentOdometer) {
        currentVehicle.currentOdometer = newKm;
        document.getElementById("infoOdo").value = newKm;
    }
}

async function addVehicle(isFirst = false) {
  const name=prompt("Nombre del coche:"); 
  if(!name) {
      if(isFirst) alert("Necesitas crear un coche para empezar.");
      return;
  }
  
  const v={ id:"car_"+Date.now(), name, fuelEntries:[], maintenanceEntries:[], reminders:[] };
  data.vehicles.push(v); 
  currentVehicle=v;
  
  renderVehicleSelect(); 
  renderTimeline(); 
  renderReminders(); 
  renderStats(); 
  
  await saveData(data);
  if(isFirst) init();
}

async function addFuel() {
  if(!currentVehicle) { alert("Primero selecciona o crea un vehículo."); return; }
  
  const dateEl = document.getElementById('fuelDate');
  const odoEl = document.getElementById('fuelOdo');
  const litersEl = document.getElementById('fuelLiters');
  const costEl = document.getElementById('fuelCost');
  const isFullEl = document.getElementById('fuelIsFull');

  if(!dateEl.value || !odoEl.value) { alert("Fecha y Km son obligatorios"); return; }

  const entry={ 
      type:"fuel", 
      date: dateEl.value, 
      odometer: Number(odoEl.value), 
      liters: Number(litersEl.value), 
      totalCost: Number(costEl.value),
      isFull: isFullEl ? isFullEl.checked : true
  };
  
  // Add new
  currentVehicle.fuelEntries.push(entry); 

  checkAndUpdateOdometer(entry.odometer); // Auto-actualizar KMs globales
  
  // Limpiar formulario y poner fecha hoy
  dateEl.value = new Date().toISOString().split("T")[0];
  odoEl.value = ""; litersEl.value = ""; costEl.value = "";
  if(isFullEl) isFullEl.checked = true;
  
  renderTimeline(); renderReminders(); renderStats();
  await saveData(data);
}

async function addMaintenance() {
  if(!currentVehicle) { alert("Primero selecciona o crea un vehículo."); return; }

  const dateEl = document.getElementById('maintDate');
  const typeEl = document.getElementById('maintType');
  const odoEl = document.getElementById('maintOdo');
  const costEl = document.getElementById('maintCost');
  const garageEl = document.getElementById('maintGarage');
  const ticketEl = document.getElementById('maintTicket');

  if(!dateEl.value || !typeEl.value) { alert("Fecha y Tipo son obligatorios"); return; }

  // Upload Logic
  let ticketUrl = null;
  // If editing and no new file, keep old ticket
  if(editState && editState.type === 'maintenance') {
      const oldEntry = currentVehicle.maintenanceEntries[editState.index];
      if(oldEntry) ticketUrl = oldEntry.ticket;
  }

  if(ticketEl.files && ticketEl.files[0]) {
      try {
          // Visual feedback
          const btn = document.querySelector('button[onclick="addMaintenance()"]');
          const originalText = btn.innerHTML;
          btn.innerHTML = "Subiendo ticket... ⏳";
          btn.disabled = true;

          const result = await uploadImage(ticketEl.files[0]);
          ticketUrl = result.url; // Use html_url for easy viewing
          
          btn.innerHTML = originalText;
          btn.disabled = false;
      } catch(e) {
          alert("Error al subir la imagen: " + e.message);
          // Restore button
          const btn = document.querySelector('button[onclick="addMaintenance()"]');
          btn.innerHTML = originalText;
          btn.disabled = false;
          return; // Stop saving if upload failed
      }
  }

  const entry={ 
      type:"maintenance", 
      date: dateEl.value, 
      maintType: typeEl.value, 
      odometer: Number(odoEl.value), 
      cost: Number(costEl.value),
      notes: garageEl ? garageEl.value : "", // Save to notes for compatibility
      ticket: ticketUrl // New URL or old URL
  };
  
  checkAndAddCategory(entry.maintType);

  currentVehicle.maintenanceEntries.push(entry); 

  checkAndUpdateOdometer(entry.odometer); // Auto-actualizar KMs globales
  
   // Limpiar formulario con fecha hoy
   dateEl.value = new Date().toISOString().split("T")[0];
   typeEl.value = ""; odoEl.value = ""; costEl.value = "";
   if(garageEl) garageEl.value = "";
   if(ticketEl) ticketEl.value = "";

  renderTimeline(); renderStats();
  await saveData(data);
}

// --- EDIT / DELETE HELPERS ---
function deleteEntry(typeIndex, typeType) {
    if(!confirm("¿Estás seguro de eliminar este registro?")) return;
    
    // typeIndex comes from _origIndex
    if(typeType === 'fuel') {
        currentVehicle.fuelEntries.splice(typeIndex, 1);
    } else {
        currentVehicle.maintenanceEntries.splice(typeIndex, 1);
    }
    
    saveData(data);
    renderTimeline();
    renderStats();
}

function editEntry(index, type) {
    editState = { type, index };
    renderTimeline(); // Re-render to show inline form
}

function saveInlineEntry(index, type) {
    let entry;
    // Helper to get value securely
    const val = (id) => document.getElementById(id).value;
    const num = (id) => Number(document.getElementById(id).value);

    try {
        if(type === 'fuel') {
            if(!val(`edit_date_${index}`) || !val(`edit_odo_${index}`)) throw new Error("Fecha y KM requeridos");
            entry = {
                type: 'fuel',
                date: val(`edit_date_${index}`),
                odometer: num(`edit_odo_${index}`),
                liters: num(`edit_liters_${index}`),
                totalCost: num(`edit_cost_${index}`),
                isFull: document.getElementById(`edit_isFull_${index}`).checked
            };
            currentVehicle.fuelEntries[index] = entry;

        } else {
            if(!val(`edit_date_${index}`) || !val(`edit_type_${index}`)) throw new Error("Fecha y Tipo requeridos");
            // Preserve ticket if not changed (no upload in inline edit for now, just keep old)
            const oldEntry = currentVehicle.maintenanceEntries[index];
            entry = {
                type: 'maintenance',
                date: val(`edit_date_${index}`),
                maintType: val(`edit_type_${index}`),
                odometer: num(`edit_odo_${index}`),
                cost: num(`edit_cost_${index}`),
                notes: val(`edit_notes_${index}`),
                ticket: oldEntry.ticket // Keep existing ticket
            };
            currentVehicle.maintenanceEntries[index] = entry;
        }

        checkAndUpdateOdometer(entry.odometer);
        saveData(data);
        exitEditMode();

    } catch(e) {
        alert(e.message);
    }
}

function exitEditMode() {
    editState = null;
    renderTimeline();
}

// Helper para evitar problemas con comillas y caracteres especiales en el HTML
function escapeAttr(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(/"/g, '&quot;');
}

// Add filter/sort control at the top of history
function renderTimeline() {
  const list=document.getElementById("timeline"); list.innerHTML="";
  if(!currentVehicle) return;

  // Add Sorting Controls
  const sortDiv = document.createElement("div");
  sortDiv.style.cssText = "padding: 0 10px 10px 10px; border-bottom: 1px solid #f1f5f9; display:flex; justify-content:flex-end;";
  sortDiv.innerHTML = `
    <select onchange="updateHistorySort(this.value)" style="padding:4px 8px; border-radius:4px; border:1px solid #cbd5e1; font-size:0.85rem; background:white;">
        <option value="date_desc" ${currentHistorySort==='date_desc'?'selected':''}>Fecha (Reciente)</option>
        <option value="date_asc" ${currentHistorySort==='date_asc'?'selected':''}>Fecha (Antiguo)</option>
        <option value="cost_desc" ${currentHistorySort==='cost_desc'?'selected':''}>Coste (Mayor)</option>
        <option value="cost_asc" ${currentHistorySort==='cost_asc'?'selected':''}>Coste (Menor)</option>
    </select>
  `;
  list.appendChild(sortDiv);
  
  // Combine and sort entries
  const fuels = currentVehicle.fuelEntries.map((e,i) => ({...e, _origIndex: i, _type: 'fuel'}));
  const maints = currentVehicle.maintenanceEntries.map((e,i) => ({...e, _origIndex: i, _type: 'maintenance'}));

  const all=[...fuels, ...maints].sort((a,b) => {
      // Sort logic switch
      if (currentHistorySort === 'date_desc' || currentHistorySort === 'date_asc') {
          const da = new Date(a.date);
          const db = new Date(b.date);
          if (isNaN(da)) return 1; if (isNaN(db)) return -1;
          return currentHistorySort === 'date_desc' ? (db - da) : (da - db);
      } else if (currentHistorySort === 'cost_desc' || currentHistorySort === 'cost_asc') {
          const ca = Number(a.totalCost || a.cost || 0);
          const cb = Number(b.totalCost || b.cost || 0);
          return currentHistorySort === 'cost_desc' ? (cb - ca) : (ca - cb);
      }
      return 0;
  });

  // Defines SVG Icons
  const icons = {
      fuel: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#3B82F6"><path d="M3 21.01h.01"></path><path d="M9 21.01h.01"></path><path d="M15 21.01h.01"></path><path d="M21 21.01h.01"></path><path d="M4 21a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2"></path><path d="M3 11h18"></path><path d="M15 11v10"></path></svg>`,
      maint: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#F97316"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>`,
      pin: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:text-bottom"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`,
      ticket: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:text-bottom"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
      camera: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:text-bottom"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`,
      check: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="color:#10B981; vertical-align:text-bottom"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
      alert: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="color:#F59E0B; vertical-align:text-bottom"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
      edit: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#64748b"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
      trash: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#E11D48"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
      save: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#10B981"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v13a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`,
      cancel: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#64748b"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`
  };

  all.forEach(e => { 
      const li = document.createElement("li");
      li.className = "timeline-item";
      li.style.cssText = "padding: 12px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: flex-start; gap: 15px; position: relative;";

      // --- INLINE EDIT MODE ---
      if (editState && editState.index === e._origIndex && editState.type === e._type) {
         li.style.flexDirection = "column";
         li.style.gap = "8px";
         
         if (e._type === 'fuel') {
             li.innerHTML = `
                <div style="font-weight:bold; color:#3B82F6; margin-bottom:5px;">Editando Repostaje</div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; width:100%">
                    <input type="date" id="edit_date_${e._origIndex}" value="${escapeAttr(e.date)}" style="padding:5px; border:1px solid #ddd; border-radius:4px;">
                    <input type="number" id="edit_odo_${e._origIndex}" value="${escapeAttr(e.odometer)}" placeholder="km" style="padding:5px; border:1px solid #ddd; border-radius:4px;">
                    <input type="number" id="edit_liters_${e._origIndex}" value="${escapeAttr(e.liters)}" placeholder="Litros" style="padding:5px; border:1px solid #ddd; border-radius:4px;">
                    <input type="number" id="edit_cost_${e._origIndex}" value="${escapeAttr(e.totalCost)}" placeholder="€" style="padding:5px; border:1px solid #ddd; border-radius:4px;">
                </div>
                <div style="display:flex; align-items:center; gap:5px; margin-top:5px;">
                     <input type="checkbox" id="edit_isFull_${e._origIndex}" ${e.isFull !== false ? 'checked' : ''}>
                     <label for="edit_isFull_${e._origIndex}">Lleno</label>
                </div>
                <div style="display:flex; gap:10px; margin-top:10px;">
                    <button onclick="saveInlineEntry(${e._origIndex}, 'fuel')" style="padding:5px 10px; background:#10B981; color:white; border:none; border-radius:4px; cursor:pointer">${icons.save} Guardar</button>
                    <button onclick="exitEditMode()" style="padding:5px 10px; background:#e2e8f0; color:#475569; border:none; border-radius:4px; cursor:pointer">${icons.cancel} Cancelar</button>
                </div>
             `;
         } else {
             const categoriesOptions = data.categories.sort().map(c => `<option value="${escapeAttr(c)}">${escapeAttr(c)}</option>`).join('');
             const notesTxt = e.notes || e.garage || "";
             li.innerHTML = `
                <div style="font-weight:bold; color:#F97316; margin-bottom:5px;">Editando Mantenimiento</div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; width:100%">
                    <input type="date" id="edit_date_${e._origIndex}" value="${escapeAttr(e.date)}" style="padding:5px; border:1px solid #ddd; border-radius:4px;">
                    
                    <!-- Hybrid Select/Input -->
                    <div style="display:flex; flex-direction:column; gap:2px;">
                        <input type="text" id="edit_type_${e._origIndex}" value="${escapeAttr(e.maintType)}" placeholder="Tipo" style="padding:5px; border:1px solid #ddd; border-radius:4px;">
                        <select onchange="document.getElementById('edit_type_${e._origIndex}').value=this.value" style="padding:2px; font-size:0.8rem; background:#f8fafc; border:1px solid #ddd; border-radius:4px;">
                            <option value="">▼ Seleccionar...</option>
                            ${categoriesOptions}
                            <option value="">✏️ Otro...</option>
                        </select>
                    </div>

                    <input type="number" id="edit_odo_${e._origIndex}" value="${escapeAttr(e.odometer)}" placeholder="km" style="padding:5px; border:1px solid #ddd; border-radius:4px;">
                    <input type="number" id="edit_cost_${e._origIndex}" value="${escapeAttr(e.cost)}" placeholder="€" style="padding:5px; border:1px solid #ddd; border-radius:4px;">
                </div>
                <input type="text" id="edit_notes_${e._origIndex}" value="${escapeAttr(notesTxt)}" placeholder="Notas / Taller" style="width:100%; padding:5px; border:1px solid #ddd; border-radius:4px; margin-top:8px;">
                <div style="display:flex; gap:10px; margin-top:10px;">
                    <button onclick="saveInlineEntry(${e._origIndex}, 'maintenance')" style="padding:5px 10px; background:#10B981; color:white; border:none; border-radius:4px; cursor:pointer">${icons.save} Guardar</button>
                    <button onclick="exitEditMode()" style="padding:5px 10px; background:#e2e8f0; color:#475569; border:none; border-radius:4px; cursor:pointer">${icons.cancel} Cancelar</button>
                </div>
             `;
         }
         list.appendChild(li);
         return; // Skip normal rendering
      }

      // --- NORMAL RENDER (unchanged logic) ---
      // Main Icon Container
      const iconDiv = document.createElement("div");
      iconDiv.style.cssText = `
        min-width: 40px; height: 40px; 
        border-radius: 50%; 
        background: ${e.type === "fuel" ? "#EFF6FF" : "#FFF7ED"}; 
        display: flex; align-items: center; justify-content: center;
      `;
      iconDiv.innerHTML = e.type === "fuel" ? icons.fuel : icons.maint;

      const detailsDiv = document.createElement("div");
      detailsDiv.style.flex = "1";
      // Ensure padding right to avoid overlap with actions
      detailsDiv.style.paddingRight = "60px";

      if(e.type === "fuel") {
          const statusIcon = e.isFull ? icons.check : icons.alert;
          detailsDiv.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="color:#334155">Repostaje</strong>
                <span style="font-size:0.85rem; color:#94a3b8">${e.date}</span>
            </div>
            <div style="color:#475569; margin-top:4px;">
                ${e.liters} L (${e.totalCost}€) <span style="color:#cbd5e1">|</span> ${e.odometer} km
                <span title="${e.isFull?'Lleno':'Parcial'}" style="margin-left:5px;">${statusIcon}</span>
            </div>
          `;
      } else {
          const notesText = e.notes || e.garage || "";
          
          let garageHtml = notesText ? `
            <div style="margin-top:6px; font-size:0.9rem; color:#64748b; display:flex; align-items:center; gap:4px;">
                ${icons.pin} ${notesText}
            </div>` : "";
          
          let ticketHtml = "";
          if(e.ticket) {
              ticketHtml = `
              <div style="margin-top:6px;">
                <a href="${e.ticket}" target="_blank" style="text-decoration:none; color: #E91E63; font-weight:600; font-size:0.85rem; display:flex; align-items:center; gap:4px;">
                    ${icons.ticket} Ver Ticket
                </a>
              </div>`;
          } else {
              ticketHtml = `
              <div style="margin-top:6px;">
                <button onclick="uploadTicketForEntry(${e._origIndex})" style="background:none; border:1px dashed #cbd5e1; border-radius:4px; padding:2px 8px; color:#64748b; font-size:0.8rem; cursor:pointer; display:flex; align-items:center; gap:4px;">
                    ${icons.camera} Subir Ticket
                </button>
              </div>`;
          }
          
          detailsDiv.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:start;">
                <strong style="color:#334155">${e.maintType}</strong>
                <span style="font-size:0.85rem; color:#94a3b8; white-space:nowrap; margin-left:10px;">${e.date}</span>
            </div>
            <div style="color:#475569; margin-top:2px;">
                ${e.cost}€ <span style="color:#cbd5e1">|</span> ${e.odometer} km
            </div>
            ${garageHtml}
            ${ticketHtml}
          `;
      }

      // Actions Div (Absolute top right)
      const actionsDiv = document.createElement("div");
      actionsDiv.style.cssText = "position:absolute; top:12px; right:10px; display:flex; gap:8px;";
      
      actionsDiv.innerHTML = `
        <button onclick="editEntry(${e._origIndex}, '${e._type}')" title="Editar" style="background:none; border:none; cursor:pointer; padding:2px;">${icons.edit}</button>
        <button onclick="deleteEntry(${e._origIndex}, '${e._type}')" title="Borrar" style="background:none; border:none; cursor:pointer; padding:2px;">${icons.trash}</button>
      `;

      li.appendChild(iconDiv);
      li.appendChild(detailsDiv);
      li.appendChild(actionsDiv);
      list.appendChild(li); 
  });
}

// Nueva función para subir ticket desde historial
async function uploadTicketForEntry(index) {
    // Crear input file on-the-fly
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    input.onchange = async () => {
        if(input.files && input.files[0]) {
             const m = currentVehicle.maintenanceEntries[index];
             if(!m) return;
             
             try {
                // Feedback simple (podríamos mejorar UI)
                const oldCursor = document.body.style.cursor;
                document.body.style.cursor = 'wait';
                
                const result = await uploadImage(input.files[0]);
                
                // Actualizar entrada
                m.ticket = result.url;
                await saveData(data);
                
                document.body.style.cursor = oldCursor;
                renderTimeline(); // Refrescar para ver el link
             } catch(e) {
                 alert("Error subiendo: " + e.message);
                 document.body.style.cursor = 'default';
             }
        }
    };
    
    input.click();
}

function renderStats() {
  const div=document.getElementById("stats"); 
  div.innerHTML = "";
  if(!currentVehicle) return;
  
  // Usamos el odometro actual global como referencia final si existe
  const currentTotalKm = currentVehicle.currentOdometer || calculateMaxOdometer();
  const currentYear = new Date().getFullYear();
  
  // Calcular Costes Totales
  let totalFuelCost = 0;
  let totalMaintCost = 0;
  let currentYearMaintCost = 0;

  (currentVehicle.fuelEntries || []).forEach(f => totalFuelCost += (f.totalCost || 0));
  (currentVehicle.maintenanceEntries || []).forEach(m => {
      const c = (m.cost || 0);
      totalMaintCost += c;
      if(new Date(m.date).getFullYear() === currentYear) {
          currentYearMaintCost += c;
      }
  });

  const grandTotal = totalFuelCost + totalMaintCost;

  // HTML Base
  let html = `<div class="stats-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap:1rem; text-align:center;">
    <div style="background:#f1f5f9; padding:10px; border-radius:8px;">
        <div style="font-size:0.8rem; color:#64748b;">Kilometraje</div>
        <div style="font-size:1.2rem; font-weight:bold; color:#0f172a;">${currentTotalKm.toLocaleString()} km</div>
    </div>
    <div style="background:#f1f5f9; padding:10px; border-radius:8px;">
        <div style="font-size:0.8rem; color:#64748b;">Gasto Total (Histórico)</div>
        <div style="font-size:1.2rem; font-weight:bold; color:#0f172a;">${grandTotal.toFixed(2)} €</div>
    </div>
    <div style="background:#f1f5f9; padding:10px; border-radius:8px;">
        <div style="font-size:0.8rem; color:#64748b;">Mantenimiento (${currentYear})</div>
        <div style="font-size:1.2rem; font-weight:bold; color:#0f172a;">${currentYearMaintCost.toFixed(2)} €</div>
    </div>`;

  // Calcular consumos -> Lógica Mejorada (isFull aware)
  const fuels=[...currentVehicle.fuelEntries].sort((a,b)=>a.odometer-b.odometer);
  if(fuels.length >= 2){
      let totalLiters = 0;
      let totalDistance = 0;
      
      // Encontrar segmentos válidos entre llenados completos
      // Estrategia: Buscar "isFull" markings.
      // Si tengo [Full A, Partial B, Partial C, Full D], 
      // Distancia = D.odo - A.odo
      // Litros = B.lit + C.lit + D.lit (A.lit llena el deposito ANTES de A, no cuenta para el consumo A->D)
      
      let lastFullIndex = -1;
      
      // Buscar el primer Full para empezar a contar
      for(let i=0; i<fuels.length; i++) {
          if(fuels[i].isFull) {
              lastFullIndex = i;
              break;
          }
      }
      
      if(lastFullIndex !== -1) {
          // Recorrer desde el siguiente
          let currentSegmentLiters = 0;
          
          for(let i = lastFullIndex + 1; i < fuels.length; i++) {
              const f = fuels[i];
              currentSegmentLiters += f.liters;
              
              if(f.isFull) {
                  // Cierra segmento
                  const startOdo = fuels[lastFullIndex].odometer;
                  const endOdo = f.odometer;
                  const dist = endOdo - startOdo;
                  
                  if(dist > 0) {
                      totalDistance += dist;
                      totalLiters += currentSegmentLiters;
                  }
                  
                  // Reset para siguiente segmento
                  lastFullIndex = i;
                  currentSegmentLiters = 0;
              }
          }
          
          if(totalDistance > 0) {
              const consumo=(totalLiters/totalDistance)*100; 
              // Usa todo el historial para coste, pero consumo solo segmentos validos
              const costKm=totalFuelCost/(fuels[fuels.length-1].odometer - fuels[0].odometer); 
              
              html += `
                <div style="background:#f1f5f9; padding:10px; border-radius:8px;">
                    <div style="font-size:0.8rem; color:#64748b;">Consumo Medio (Real)</div>
                    <div style="font-size:1.2rem; font-weight:bold; color:#0f172a;">${consumo.toFixed(2)} L/100</div>
                </div>
                <div style="background:#f1f5f9; padding:10px; border-radius:8px;">
                    <div style="font-size:0.8rem; color:#64748b;">Coste/Km (Diesel/Gaso)</div>
                    <div style="font-size:1.2rem; font-weight:bold; color:#0f172a;">${costKm.toFixed(3)} €</div>
                </div>`;
          }
      }
  }
  
  html += `</div>`;
  div.innerHTML=html;
}

// ---------------- RECORDATORIOS EDITABLES ----------------
function renderReminders(){
  const container = document.getElementById("remindersList"); 
  if(!container) return; // Safety check
  container.innerHTML="";
  if(!currentVehicle) return;

  const currentOdometer = currentVehicle.currentOdometer || calculateMaxOdometer();
  const today = new Date();

  // Add Sort Controls
  const sortDiv = document.createElement("div");
  sortDiv.style.cssText = "padding: 0 0 10px 0; border-bottom: 1px solid #f1f5f9; display:flex; justify-content:flex-end; margin-bottom:10px;";
  sortDiv.innerHTML = `
    <select onchange="updateReminderSort(this.value)" style="padding:4px 8px; border-radius:4px; border:1px solid #cbd5e1; font-size:0.85rem; background:white;">
        <option value="urgency" ${currentReminderSort==='urgency'?'selected':''}>Urgencia (Semáforo)</option>
        <option value="alpha" ${currentReminderSort==='alpha'?'selected':''}>Alfabético</option>
        <option value="created" ${currentReminderSort==='created'?'selected':''}>Creación (Defecto)</option>
    </select>
  `;
  container.appendChild(sortDiv);

  // 1. Pre-calculate logic for all reminders
  const calculatedItems = currentVehicle.reminders.map((r, index) => {
    // Migration: ensure type exists. Default to 'both' if existing data implies it, else 'km'
    if(!r.type) {
        if(r.intervalKm > 0 && (r.intervalMonths > 0 || r.intervalYears > 0 || r.intervalDays > 0)) r.type = 'both';
        else if(r.intervalMonths > 0 || r.intervalYears > 0 || r.intervalDays > 0) r.type = 'date';
        else r.type = 'km';
    }

    // Find last completion
    const matches = currentVehicle.maintenanceEntries.filter(m => 
        m.maintType && r.title && m.maintType.toLowerCase().trim() === r.title.toLowerCase().trim()
    );
    let lastKm = 0;
    let lastDate = null;

    if(matches.length > 0) {
        matches.sort((a,b) => b.odometer - a.odometer);
        lastKm = matches[0].odometer;

        const timeMatches = [...matches].sort((a,b) => new Date(b.date) - new Date(a.date));
        lastDate = new Date(timeMatches[0].date);
    }

    // KM Calculation
    let dueKm = 0;
    let remainingKm = Infinity; // Use Infinity for sorting
    let effectiveTargetKm = null;
    let kmStatus = 'ok';

    if(r.type === 'km' || r.type === 'both') {
       if(r.intervalKm > 0) {
           dueKm = lastKm + Number(r.intervalKm);
           effectiveTargetKm = (r.targetKm !== undefined && r.targetKm !== null) ? Number(r.targetKm) : dueKm;
           
           remainingKm = effectiveTargetKm - currentOdometer;
           if(remainingKm < 0) kmStatus = 'danger';
           else if(remainingKm < 1000) kmStatus = 'warning';
       }
    }

    // Date Calculation
    let remainingDays = Infinity; // Use Infinity for sorting
    let effectiveTargetDate = null;
    let dateStatus = 'ok';
    
    let timeVal = 0;
    let timeUnit = 'months';
    if(r.intervalMonths) { timeVal=r.intervalMonths; timeUnit='months'; }
    else if(r.intervalYears) { timeVal=r.intervalYears; timeUnit='years'; }
    else if(r.intervalDays) { timeVal=Math.round(r.intervalDays/30); timeUnit='months'; } 

    if(r.type === 'date' || r.type === 'both') {
        if (r.targetDate) {
            effectiveTargetDate = new Date(r.targetDate);
        }
        let monthsToAdd = 0;
        if(timeUnit === 'months') monthsToAdd = Number(timeVal);
        else if(timeUnit === 'years') monthsToAdd = Number(timeVal) * 12;

        if(effectiveTargetDate) {
             const diffTime = effectiveTargetDate - today;
             remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        } else if(monthsToAdd > 0) {
            if(!lastDate) {
                 remainingDays = -99999;
            } else {
                let dueDate = new Date(lastDate);
                dueDate.setMonth(dueDate.getMonth() + monthsToAdd);
                effectiveTargetDate = dueDate; 

                const diffTime = dueDate - today;
                remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }
        }
    }

    if(r.type === 'date' || r.type === 'both') {
        if(remainingDays < 0) dateStatus = 'danger';
        else if(remainingDays < 30) dateStatus = 'warning';
    }

    let status = 'ok';
    if(kmStatus === 'danger' || dateStatus === 'danger') status = 'danger';
    else if(kmStatus === 'warning' || dateStatus === 'warning') status = 'warning';

    // Calculation for Sorting Score
    let statusPriority = 2; // Ok
    if(status === 'danger') statusPriority = 0;
    else if(status === 'warning') statusPriority = 1;
    
    const rKm = remainingKm === Infinity ? 999999 : remainingKm;
    const rDays = remainingDays === Infinity ? 999999 : remainingDays;
    const limitingFactor = Math.min(rKm, rDays * 50);
    
    return {
        originalIndex: index,
        r,
        status,
        effectiveTargetKm,
        effectiveTargetDate,
        remainingKm,
        remainingDays,
        timeVal,
        timeUnit,
        limitingFactor, 
        statusPriority
    };
  });

  // 2. Sort
  const sortedItems = calculatedItems.sort((a,b) => {
      if(currentReminderSort === 'urgency') {
          if(a.statusPriority !== b.statusPriority) return a.statusPriority - b.statusPriority;
          return a.limitingFactor - b.limitingFactor;
      } else if(currentReminderSort === 'alpha') {
          return (a.r.title || "").localeCompare(b.r.title || "");
      }
      return a.originalIndex - b.originalIndex;
  });

  // 3. Render
  sortedItems.forEach(item => {
    const { r, originalIndex, status, remainingKm, remainingDays, effectiveTargetKm, effectiveTargetDate, timeVal, timeUnit } = item;
    const index = originalIndex; 

    // For input rendering
    // Date inputs need YYYY-MM-DD
    const dateInputVal = effectiveTargetDate ? effectiveTargetDate.toISOString().split('T')[0] : '';

    // Build Card
    const card = document.createElement("div");
    card.className = `reminder-card status-${status}`;
    card.style.cssText = `
        border: 1px solid #e2e8f0; 
        border-radius: 8px; 
        padding: 12px; 
        background: white; 
        position: relative;
        border-left: 5px solid ${status === 'danger' ? '#ef4444' : status === 'warning' ? '#f59e0b' : '#10b981'};
    `;

    // HTML Structure
    let kmSection = '';
    if(r.type === 'km' || r.type === 'both') {
        kmSection = `
            <div style="margin-top:10px; padding-top:10px; border-top:1px solid #f1f5f9;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <label style="font-size:0.85rem; color:#64748b;">Intervalo (km)</label>
                    <div class="input-with-suffix">
                        <input type="number" value="${r.intervalKm}" onchange="updateReminder(${index},'intervalKm',this.value)" style="width:80px; text-align:right;">
                        <span style="font-size:0.8rem; color:#64748b; margin-left:2px;">km</span>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:8px; font-size:0.9rem;">
                    <div style="background:#f8fafc; padding:5px; border-radius:4px;">
                        <span style="display:block; font-size:0.75rem; color:#64748b;">Próximo aviso (Editable)</span>
                        <input type="number" value="${effectiveTargetKm || ''}" onchange="updateReminder(${index},'targetKm',this.value)" style="width:100%; border:1px solid #ddd; border-radius:4px; padding:2px 5px; font-weight:bold; color:#0f172a;">
                    </div>
                    <div style="background:#f8fafc; padding:5px; border-radius:4px;">
                        <span style="display:block; font-size:0.75rem; color:#64748b;">Te quedan</span>
                        <strong style="color:${remainingKm < 0 ? '#ef4444' : '#0f172a'};">${effectiveTargetKm ? remainingKm.toLocaleString() : '-'} km</strong>
                    </div>
                </div>
            </div>
        `;
    }

    let dateSection = '';
    if(r.type === 'date' || r.type === 'both') {
        let remainingText = '-';
        if(effectiveTargetDate) {
            if(remainingDays < 0) {
                 remainingText = `Hace ${Math.abs(remainingDays)} días`;
            } else {
                 if(remainingDays > 30) {
                     const y = Math.floor(remainingDays / 365);
                     const m = Math.floor((remainingDays % 365) / 30);
                     const parts = [];
                     if(y > 0) parts.push(`${y} año${y>1?'s':''}`);
                     if(m > 0) parts.push(`${m} mes${m>1?'es':''}`);
                     remainingText = parts.length > 0 ? parts.join(' y ') : `${remainingDays} días`; // Fallback for exactly 30-ish days if calc results in 0
                 } else {
                     remainingText = `${remainingDays} días`;
                 }
            }
        }

        dateSection = `
            <div style="margin-top:10px; padding-top:10px; border-top:1px solid #f1f5f9;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <label style="font-size:0.85rem; color:#64748b;">Intervalo (Tiempo)</label>
                    <div style="display:flex; gap:5px;">
                        <input type="number" value="${timeVal}" onchange="updateReminderTime(${index}, this.value, document.getElementById('unit_${index}').value)" style="width:60px; text-align:right;">
                        <select id="unit_${index}" onchange="updateReminderTime(${index}, this.previousElementSibling.value, this.value)" style="font-size:0.85rem;">
                             <option value="months" ${timeUnit==='months'?'selected':''}>Meses</option>
                             <option value="years" ${timeUnit==='years'?'selected':''}>Años</option>
                        </select>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:8px; font-size:0.9rem;">
                    <div style="background:#f8fafc; padding:5px; border-radius:4px;">
                        <span style="display:block; font-size:0.75rem; color:#64748b;">Próxima fecha (Editable)</span>
                        <input type="date" value="${dateInputVal}" onchange="updateReminder(${index}, 'targetDate', this.value)" style="width:100%; border:1px solid #ddd; border-radius:4px; padding:2px 5px; font-weight:bold; color:#0f172a;">
                    </div>
                    <div style="background:#f8fafc; padding:5px; border-radius:4px;">
                        <span style="display:block; font-size:0.75rem; color:#64748b;">Te quedan</span>
                        <strong style="color:${remainingDays < 0 ? '#ef4444' : '#0f172a'};">${effectiveTargetDate ? remainingText : '-'}</strong>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Categories for title - dropdown
    // Create a copy to avoid mutating the global category list when adding custom titles
    const sortedCats = [...data.categories].sort();
    
    // Ensure current title is in the list (if not empty) so it doesn't get lost in the UI
    if (r.title && !sortedCats.includes(r.title)) {
        sortedCats.push(r.title);
        sortedCats.sort();
    }

    const categoriesOptions = sortedCats.map(c => 
        `<option value="${escapeAttr(c)}" ${r.title === c ? 'selected' : ''}>${escapeAttr(c)}</option>`
    ).join('');

    card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
             <div style="flex:1; margin-right:10px;">
                 <label style="font-size:0.75rem; color:#64748b; display:block; margin-bottom:2px;">Título (Tipo de mantenimiento)</label>
                 <select onchange="updateReminder(${index},'title',this.value)" 
                        style="width:100%; font-weight:bold; border:1px solid #cbd5e1; border-radius:4px; padding:4px;">
                     <option value="">Seleccionar...</option>
                     ${categoriesOptions}
                 </select>
             </div>
             <div>
                 <label style="font-size:0.75rem; color:#64748b; display:block; margin-bottom:2px;">Tipo</label>
                 <select onchange="updateReminder(${index},'type',this.value)" style="padding:4px; border-radius:4px; border:1px solid #cbd5e1;">
                     <option value="km" ${r.type==='km'?'selected':''}>Por Km</option>
                     <option value="date" ${r.type==='date'?'selected':''}>Por Fecha</option>

                     <option value="both" ${r.type==='both'?'selected':''}>Ambos</option>
                 </select>
             </div>
             <button onclick="deleteReminder(${index})" style="margin-left:10px; background:none; border:none; cursor:pointer; color:#ef4444; padding-top:15px;">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
             </button>
        </div>
        ${kmSection}
        ${dateSection}
    `;

    container.appendChild(card);
  });
}

function addReminder(){ 
  // Default new reminder
  const r={ title:"", type:"km", intervalKm:15000, intervalMonths:0, lastOdometer:0, lastDate:null };
  currentVehicle.reminders.push(r); 
  renderReminders(); 
  saveData(data);
}

// Helper especial para cambiar tiempo/unidad y guardarlo en el formato correcto
// Guardamos siempre como "intervalMonths" en el JSON
function updateReminderTime(index, value, unit) {
   const val = Number(value);
   const r = currentVehicle.reminders[index];
   
   // Clean legacy
   delete r.intervalDays;
   delete r.intervalYears;

   if(unit === 'years') {
       r.intervalYears = val; // Store explicit years if user selected years?
       // Actually cleaner: store only intervalMonths internally, OR store separate boolean?
       // Let's stick to storing what user selected to persist the "Unit" selection UI state implicitly
       r.intervalMonths = 0; 
   } else {
       r.intervalMonths = val;
       r.intervalYears = 0;
   }
   
   // Reset manual target date when interval changes
   r.targetDate = null;
   
   renderReminders();
   saveData(data);
}

function updateReminder(index,field,value){
  const r = currentVehicle.reminders[index];
  
  if(field==='intervalKm') {
      value=Number(value);
      r.targetKm = null; // Reset manual override
  }
  if(field==='targetKm') {
      value=Number(value);
  }
  
  if(field==='title') checkAndAddCategory(value);
  
  r[field]=value; 
  renderReminders();
  saveData(data);
}

function deleteReminder(index){
  if(!confirm("¿Eliminar este recordatorio?")) return;
  currentVehicle.reminders.splice(index,1); renderReminders(); saveData(data);
}

// Expose start to global scope
window.startApp = start;

// --- UI TABS LOGIC ---
window.openTab = function(tabId) {
    // Ocultar todos los contenidos
    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active');
    });
    
    // Desactivar todos los botones
    const btns = document.querySelectorAll('.tab-btn');
    btns.forEach(btn => btn.classList.remove('active'));
    
    // Mostrar el contenido seleccionado
    const target = document.getElementById(tabId);
    if (target) {
        target.style.display = 'block';
        // Pequeño timeout para permitir transición CSS si existiera
        setTimeout(() => target.classList.add('active'), 0);
    }
    
    // Activar el botón correspondiente
    // Buscamos el botón que tenga el onclick apuntando a este tabId
    btns.forEach(btn => {
        const onClickAttr = btn.getAttribute('onclick');
        if (onClickAttr && onClickAttr.includes(`'${tabId}'`)) {
            btn.classList.add('active');
        }
    });
};

// --- EXPORT PDF FEATURE ---
async function fetchImageAsBase64(url) {
  if (!url) return null;
  try {
      const token = sessionStorage.getItem("githubToken");
      let fetchUrl = url;
      const headers = { 'Authorization': `Bearer ${token}` };

      // Heuristic: Convert GitHub Blob URL to API Raw URL if needed for private repos
      // Blob: https://github.com/user/repo/blob/main/path/img.jpg
      // API: https://api.github.com/repos/user/repo/contents/path/img.jpg?ref=main
      if (url.includes('github.com') && url.includes('/blob/')) {
          const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+)$/);
          if (match) {
              const [_, owner, repo, branch, path] = match;
              fetchUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
              headers['Accept'] = 'application/vnd.github.v3.raw';
          }
      } else if (url.includes('api.github.com')) {
          headers['Accept'] = 'application/vnd.github.v3.raw';
      }

      const res = await fetch(fetchUrl, { headers });
      if(!res.ok) throw new Error(`Status ${res.status}`);
      const blob = await res.blob();
      
      return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
      });
  } catch(e) {
      console.warn("PDF Attachment fetch failed:", e);
      return null;
  }
}

async function exportVehiclePDF() {
  if(!currentVehicle) return;
  const { jsPDF } = window.jspdf;
  if (!jsPDF) {
      alert("Error: Librería PDF no cargada. Revisa tu conexión a internet.");
      return;
  }

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // --- HEADER ---
  doc.setFontSize(22);
  doc.setTextColor(40);
  doc.text("Informe de Vehículo", pageWidth/2, 20, { align: 'center' });
  
  doc.setFontSize(16);
  doc.setTextColor(60);
  doc.text(`${currentVehicle.brand || ''} ${currentVehicle.model || 'Vehículo'} (${currentVehicle.plate || 'S/M'})`, pageWidth/2, 30, { align: 'center' });

  let yPos = 35;

  // --- IMAGE (New) ---
  const imgEl = document.getElementById("vehiclePhotoImg");
  if (imgEl && imgEl.src && imgEl.style.display !== 'none' && imgEl.naturalWidth > 0) {
      try {
          // Draw to canvas to extract Base64 Data
          const canvas = document.createElement("canvas");
          canvas.width = imgEl.naturalWidth;
          canvas.height = imgEl.naturalHeight;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(imgEl, 0, 0);
          
          const imgData = canvas.toDataURL('image/jpeg', 0.75); // Compress slightly
          
          // Calculate Aspect Ratio
          const imgRatio = imgEl.naturalHeight / imgEl.naturalWidth;
          const pdfImgWidth = 80; // Sentral width mm
          const pdfImgHeight = pdfImgWidth * imgRatio;
          
          // Center Image
          const xImg = (pageWidth - pdfImgWidth) / 2;
          
          doc.addImage(imgData, 'JPEG', xImg, yPos + 5, pdfImgWidth, pdfImgHeight);
          yPos += pdfImgHeight + 15; // Advance cursor
          
      } catch(e) {
          console.warn("Error embedding image in PDF:", e);
      }
  } else {
      yPos += 5; // Little spacing if no image
  }

  // --- INFO BLOCK ---
  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.setDrawColor(200);
  doc.line(14, yPos, pageWidth-14, yPos);

  yPos += 10;
  const leftX = 14;
  const rightX = pageWidth / 2 + 10;
  
  doc.setFontSize(10);
  doc.text(`Matrícula: ${currentVehicle.plate || '-'}`, leftX, yPos);
  doc.text(`VIN: ${currentVehicle.vin || '-'}`, rightX, yPos);
  yPos += 7;
  doc.text(`Fecha Compra: ${currentVehicle.purchaseDate || '-'}`, leftX, yPos);
  doc.text(`Fecha Matriculación: ${currentVehicle.regDate || '-'}`, rightX, yPos);
  yPos += 7;
  
  // Calculate Stats again for PDF
  const currentTotalKm = currentVehicle.currentOdometer || calculateMaxOdometer();
  let totalFuelCost = 0;
  let totalMaintCost = 0;
  (currentVehicle.fuelEntries || []).forEach(f => totalFuelCost += (f.totalCost || 0));
  (currentVehicle.maintenanceEntries || []).forEach(m => totalMaintCost += (m.cost || 0));
  
  doc.text(`Kilometraje Actual: ${currentTotalKm.toLocaleString()} km`, leftX, yPos);
  doc.text(`Gasto Total: ${(totalFuelCost + totalMaintCost).toFixed(2)} €`, rightX, yPos);
  yPos += 15;

  // --- STATS SUMMARY ---
  doc.setFontSize(14);
  doc.text("Resumen de Estadísticas", 14, yPos);
  yPos += 5;
  doc.setLineWidth(0.5);
  doc.line(14, yPos, pageWidth-14, yPos);
  yPos += 10;
  
  // Calculate consumption logic simplified for PDF summary
  const fuels=[...currentVehicle.fuelEntries].sort((a,b)=>a.odometer-b.odometer);
  let consumptionText = "N/A";
  let costKmText = "N/A";

  if(fuels.length >= 2){
      let totalLiters = 0;
      let totalDistance = 0;
      let lastFullIndex = -1;
      
      for(let i=0; i<fuels.length; i++) {
          if(fuels[i].isFull) {
              lastFullIndex = i;
              break;
          }
      }
      if(lastFullIndex !== -1) {
          let currentSegmentLiters = 0;
          for(let i = lastFullIndex + 1; i < fuels.length; i++) {
              const f = fuels[i];
              currentSegmentLiters += f.liters;
              if(f.isFull) {
                  const dist = f.odometer - fuels[lastFullIndex].odometer;
                  if(dist > 0) {
                      totalDistance += dist;
                      totalLiters += currentSegmentLiters;
                  }
                  lastFullIndex = i;
                  currentSegmentLiters = 0;
              }
          }
          if(totalDistance > 0) {
              consumptionText = ((totalLiters/totalDistance)*100).toFixed(2) + " L/100";
          }
          if(fuels[fuels.length-1].odometer - fuels[0].odometer > 0) {
             const costKm=totalFuelCost/(fuels[fuels.length-1].odometer - fuels[0].odometer);
             costKmText = costKm.toFixed(3) + " €/km";
          }
      }
  }

  const statsData = [
      ["Kilómetros Totales", `${currentTotalKm} km`],
      ["Gasto Combustible", `${totalFuelCost.toFixed(2)} €`],
      ["Gasto Mantenimiento", `${totalMaintCost.toFixed(2)} €`],
      ["Consumo Medio", consumptionText],
      ["Coste por Km", costKmText]
  ];

  doc.autoTable({
      startY: yPos,
      head: [['Métrica', 'Valor']],
      body: statsData,
      theme: 'striped',
      headStyles: { fillColor: [41, 128, 185] },
      margin: { top: 10 }
  });

  yPos = doc.lastAutoTable.finalY + 15;

  // --- HISTORY TABLE ---
  doc.setFontSize(14);
  doc.text("Historial Detallado", 14, yPos);
  yPos += 5;
  doc.line(14, yPos, pageWidth-14, yPos);
  yPos += 5;

  // Merge and sort Entries
  const fEntries = currentVehicle.fuelEntries.map(e => ({
      date: e.date,
      type: 'Repostaje', 
      desc: `${e.liters}L (${e.isFull?'Lleno':'Parcial'})`, 
      odo: e.odometer, 
      cost: e.totalCost
  }));
  const mEntries = currentVehicle.maintenanceEntries.map(e => ({
      date: e.date,
      type: 'Mantenimiento', 
      desc: `${e.maintType} - ${e.notes || ''}`, 
      odo: e.odometer, 
      cost: e.cost
  }));

  const history = [...fEntries, ...mEntries].sort((a,b) => new Date(b.date) - new Date(a.date));

  const tableBody = history.map(h => [
      h.date,
      h.type,
      h.desc,
      h.odo.toLocaleString(),
      h.cost.toFixed(2) + " €"
  ]);

  doc.autoTable({
      startY: yPos,
      head: [['Fecha', 'Tipo', 'Detalle', 'Odómetro', 'Coste']],
      body: tableBody,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [52, 73, 94] }
  });

  // --- ATTACHMENTS (Tickets) ---
  const ticketEntries = (currentVehicle.maintenanceEntries||[]).filter(m => m.ticket);
  
  if(ticketEntries.length > 0) {
      // Process serially to maintain order and pdf structure
      for(const entry of ticketEntries) {
          try {
              const b64 = await fetchImageAsBase64(entry.ticket);
              if(b64) {
                  doc.addPage();
                  
                  // Header
                  doc.setFontSize(14);
                  doc.setTextColor(40);
                  doc.text("Adjunto: Ticket / Factura", 14, 20);
                  
                  // Meta info
                  doc.setFontSize(10);
                  doc.setTextColor(100);
                  doc.text(`Fecha: ${entry.date} | Tipo: ${entry.maintType}`, 14, 28);
                  doc.text(`Coste: ${entry.cost} € | ${entry.garage || 'Sin taller'}`, 14, 34);
                  
                  // Image
                  const imgProps = doc.getImageProperties(b64);
                  const pdfW = doc.internal.pageSize.getWidth();
                  const pdfH = doc.internal.pageSize.getHeight();
                  const margin = 14;
                  const maxW = pdfW - (margin*2);
                  const maxH = pdfH - 50; // top margin
                  
                  const ratio = imgProps.height / imgProps.width;
                  let finalW = maxW;
                  let finalH = finalW * ratio;
                  
                  // Scale if too tall
                  if(finalH > maxH) {
                      finalH = maxH;
                      finalW = finalH / ratio;
                  }
                  
                  doc.addImage(b64, 'JPEG', margin, 40, finalW, finalH);
              }
          } catch(err) {
              console.warn("Could not add attachment for", entry, err);
          }
      }
  }

  // Save
  doc.save(`Informe_${currentVehicle.plate || 'Vehiculo'}_${new Date().toISOString().split('T')[0]}.pdf`);
}

// Initial check & Boot
function updateHistorySort(val) {
    currentHistorySort = val;
    renderTimeline();
}

function updateReminderSort(val) {
    currentReminderSort = val;
    renderReminders();
}

async function initApp() {
  try {
      const token = sessionStorage.getItem("githubToken");
      const loginScreen = document.getElementById("login-screen");
      const appContainer = document.getElementById("app-container");
      
      if(token) {
        if(loginScreen) loginScreen.classList.add("hidden");
        if(appContainer) appContainer.classList.remove("hidden");
        
        const launch = async () => {
            try {
                await start();
                // Ensure dashboard is open by default
                if(window.openTab) window.openTab('dashboard');
            } catch (e) {
                console.error("Boot Error:", e);
                alert("Error crítico al iniciar la aplicación: " + e.message);
            }
        };

        if (document.readyState === 'loading') {
           document.addEventListener('DOMContentLoaded', launch);
        } else {
           await launch();
        }
      } else {
        if(loginScreen) loginScreen.classList.remove("hidden");
      }
  } catch (err) {
      alert("Error fatal de arranque: " + err.message);
  }
}

initApp();
