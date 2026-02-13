let data; let currentVehicle;
let editState = null; // { type: 'fuel'|'maintenance', index: number }

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
  renderVehicleInfo(); // Nueva función
  renderTimeline(); 
  renderReminders(); 
  renderStats(); 
}

function renderCategoriesDatalist() {
    let datalist = document.getElementById("maintenance-categories");
    if(!datalist) {
        datalist = document.createElement("datalist");
        datalist.id = "maintenance-categories";
        document.body.appendChild(datalist);
    }
    datalist.innerHTML = "";
    data.categories.sort().forEach(cat => {
        const opt = document.createElement("option");
        opt.value = cat;
        datalist.appendChild(opt);
    });
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

function renderVehicleInfo() {
  if(!currentVehicle) return;
  
  // Rellenar campos, usando string vacio si no existen
  document.getElementById("infoPlate").value = currentVehicle.plate || "";
  document.getElementById("infoVin").value = currentVehicle.vin || "";
  document.getElementById("infoRegDate").value = currentVehicle.regDate || "";
  document.getElementById("infoPurchaseDate").value = currentVehicle.purchaseDate || "";
  document.getElementById("infoNotes").value = currentVehicle.notes || "";
  
  // Kilometraje: Si no tiene campo propio, usamos el calculado, y lo guardamos
  if (currentVehicle.currentOdometer === undefined) {
      currentVehicle.currentOdometer = calculateMaxOdometer();
  }
  document.getElementById("infoOdo").value = currentVehicle.currentOdometer;
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
  
  if (editState && editState.type === 'fuel') {
      // Update existing
      currentVehicle.fuelEntries[editState.index] = entry;
      exitEditMode();
  } else {
      // Add new
      currentVehicle.fuelEntries.push(entry); 
  }

  checkAndUpdateOdometer(entry.odometer); // Auto-actualizar KMs globales
  
  // Limpiar formulario
  dateEl.value = ""; odoEl.value = ""; litersEl.value = ""; costEl.value = "";
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

  if (editState && editState.type === 'maintenance') {
      currentVehicle.maintenanceEntries[editState.index] = entry;
      exitEditMode();
  } else {
      currentVehicle.maintenanceEntries.push(entry); 
  }

  checkAndUpdateOdometer(entry.odometer); // Auto-actualizar KMs globales
  
   // Limpiar formulario
   dateEl.value = ""; typeEl.value = ""; odoEl.value = ""; costEl.value = "";
   if(garageEl) garageEl.value = "";
   if(ticketEl) ticketEl.value = "";

  renderTimeline(); renderStats();
  await saveData(data);
}

function renderTimeline() {
  const list=document.getElementById("timeline"); list.innerHTML="";
  if(!currentVehicle) return;
  
  // Combine and sort entries
  const fuels = currentVehicle.fuelEntries.map((e,i) => ({...e, _origIndex: i, _type: 'fuel'}));
  const maints = currentVehicle.maintenanceEntries.map((e,i) => ({...e, _origIndex: i, _type: 'maintenance'}));

  const all=[...fuels, ...maints].sort((a,b) => new Date(b.date) - new Date(a.date));

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
      trash: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#E11D48"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`
  };

  all.forEach(e => { 
      const li = document.createElement("li");
      li.className = "timeline-item";
      li.style.cssText = "padding: 12px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: flex-start; gap: 15px; position: relative;";

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
  const tbody=document.querySelector("#reminderTable tbody"); tbody.innerHTML="";
  if(!currentVehicle) return;

  const currentOdometer = currentVehicle.currentOdometer || calculateMaxOdometer();
  const today = new Date();

  currentVehicle.reminders.forEach((r,index)=>{
    // Lógica de Estado (Semáforo)
    let status = 'ok'; 
    let reasons = [];

    // 1. Buscar último mantenimiento realizado que coincida con el título
    const matches = currentVehicle.maintenanceEntries.filter(m => 
        m.maintType && r.title && m.maintType.toLowerCase().trim() === r.title.toLowerCase().trim()
    );

    let lastKm = 0;
    let lastDate = null;

    if(matches.length > 0) {
        // Ordenar por odómetro desc
        matches.sort((a,b) => b.odometer - a.odometer);
        lastKm = matches[0].odometer; // El más reciente en KM

        // Ordenar por fecha desc (puede ser distinto si metieron datos desordenados)
        const timeMatches = [...matches].sort((a,b) => new Date(b.date) - new Date(a.date));
        lastDate = new Date(timeMatches[0].date);
    }

    // 2. Calcular Status por KM
    if(r.intervalKm > 0) {
        const dueKm = lastKm + r.intervalKm;
        const remainingKm = dueKm - currentOdometer;
        
        if (remainingKm < 0) {
            status = 'danger';
            reasons.push(`Pasado por ${Math.abs(remainingKm)} km`);
        } else if (remainingKm < 1000) {
            if(status !== 'danger') status = 'warning';
            reasons.push(`Vence en ${remainingKm} km`);
        } else {
            reasons.push(`Quedan ${remainingKm} km`);
        }
    }

    // 3. Calcular Status por Tiempo
    let monthsToAdd = 0;
    if(r.intervalMonths) monthsToAdd = r.intervalMonths;
    else if(r.intervalYears) monthsToAdd = r.intervalYears * 12;
    // Si guardó days (legacy), convertimos
    else if(r.intervalDays) monthsToAdd = r.intervalDays / 30;

    if(monthsToAdd > 0) {
        if (!lastDate) {
            // Nunca hecho y tiene fecha límite -> Danger o Warning?
            // Si el coche es nuevo no pasa nada, pero asumimos que si configuras recordatorio quieres control.
            status = 'danger';
            reasons.push("Nunca realizado (fecha)");
        } else {
            const dueDate = new Date(lastDate);
            dueDate.setMonth(dueDate.getMonth() + monthsToAdd);
            
            // Diff en días
            const diffTime = dueDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            
            if(diffDays < 0) {
                status = 'danger';
                reasons.push(`Vencido hace ${Math.abs(diffDays)} días`);
            } else if(diffDays < 30) {
                if(status !== 'danger') status = 'warning';
                reasons.push(`Vence en ${diffDays} días`);
            } else {
                reasons.push(`Quedan ${diffDays} días`);
            }
        }
    }

    // Preparar UI
    
    let timeVal = 0;
    let timeUnit = 'months'; // default
    
    if (r.intervalMonths) {
       timeVal = r.intervalMonths;
       timeUnit = 'months';
    } else if (r.intervalYears) {
       timeVal = r.intervalYears;
       timeUnit = 'years';
    } else if (r.intervalDays) {
       timeVal = Math.round(r.intervalDays / 30);
       timeUnit = 'months';
    }

    const tr=document.createElement("tr");
    tr.className = `status-${status}`;
    tr.title = reasons.join(" • "); // Tooltip nativo

    tr.innerHTML=`
      <td><input type="text" value="${r.title}" list="maintenance-categories" onchange="updateReminder(${index},'title',this.value)"></td>
      <td><input type="number" value="${r.intervalKm}" onchange="updateReminder(${index},'intervalKm',this.value)" style="width: 80px"> km</td>
      <td style="display:flex; gap:5px;">
        <input type="number" value="${timeVal}" onchange="updateReminderTime(${index}, this.value, document.getElementById('unit_${index}').value)" style="width: 60px">
        <select id="unit_${index}" onchange="updateReminderTime(${index}, this.previousElementSibling.value, this.value)">
           <option value="months" ${timeUnit==='months'?'selected':''}>Meses</option>
           <option value="years" ${timeUnit==='years'?'selected':''}>Años</option>
        </select>
      </td>
      <td><button onclick="deleteReminder(${index})" class="btn-danger">❌</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function addReminder(){ 
  const r={ title:"Nuevo mantenimiento", intervalKm:0, intervalMonths:0, lastOdometer:0, lastDate:null };
  currentVehicle.reminders.push(r); renderReminders(); saveData(data);
}

// Helper especial para cambiar tiempo/unidad y guardarlo en el formato correcto
// Guardamos siempre como "intervalMonths" en el JSON para estandarizar en Backend, 
// o intervalDays si queremos maxima compatibilidad, pero el usuario pidió MESES/AÑOS.
// Voy a guardar: intervalMonths (borrando intervalDays viejo para limpiar)
function updateReminderTime(index, value, unit) {
   const val = Number(value);
   const r = currentVehicle.reminders[index];
   
   // Limpiamos propiedades antiguas para no confundir
   delete r.intervalDays;
   delete r.intervalYears;
   
   if (unit === 'years') {
       r.intervalMonths = val * 12; // Guardamos todo en meses internamente
       // Guardamos una flag visual o re-calculamos al renderizar?
       // Mejor guardamos la propiedad intervalYears si el usuario quiere "Años" para mantener su preferencia visual?
       // No, mejor normalizamos a months para lógica backend, y en render dividimos si es mult de 12.
       // Pero para cumplir con la petición de "store as months/years params", voy a guardar la propiedad especifica.
       r.intervalYears = val;
       delete r.intervalMonths; 
   } else {
       r.intervalMonths = val;
   }
   
   saveData(data);
}

function updateReminder(index,field,value){
  if(field==='intervalKm') value=Number(value);
  if(field==='title') checkAndAddCategory(value);
  
  currentVehicle.reminders[index][field]=value; saveData(data);
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

// Initial check & Boot
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
