let data; let currentVehicle;

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

  if(!dateEl.value || !odoEl.value) { alert("Fecha y Km son obligatorios"); return; }

  const entry={ 
      type:"fuel", 
      date: dateEl.value, 
      odometer: Number(odoEl.value), 
      liters: Number(litersEl.value), 
      totalCost: Number(costEl.value)
  };
  
  currentVehicle.fuelEntries.push(entry); 
  checkAndUpdateOdometer(entry.odometer); // Auto-actualizar KMs globales
  
  // Limpiar formulario
  dateEl.value = ""; odoEl.value = ""; litersEl.value = ""; costEl.value = "";
  
  renderTimeline(); renderReminders(); renderStats();
  await saveData(data);
}

async function addMaintenance() {
  if(!currentVehicle) { alert("Primero selecciona o crea un vehículo."); return; }

  const dateEl = document.getElementById('maintDate');
  const typeEl = document.getElementById('maintType');
  const odoEl = document.getElementById('maintOdo');
  const costEl = document.getElementById('maintCost');

  if(!dateEl.value || !typeEl.value) { alert("Fecha y Tipo son obligatorios"); return; }

  const entry={ 
      type:"maintenance", 
      date: dateEl.value, 
      maintType: typeEl.value, 
      odometer: Number(odoEl.value), 
      cost: Number(costEl.value)
  };
  
  checkAndAddCategory(entry.maintType);

  currentVehicle.maintenanceEntries.push(entry); 
  checkAndUpdateOdometer(entry.odometer); // Auto-actualizar KMs globales
  
   // Limpiar formulario
   dateEl.value = ""; typeEl.value = ""; odoEl.value = ""; costEl.value = "";

  renderTimeline(); renderStats();
  await saveData(data);
}

function renderTimeline() {
  const list=document.getElementById("timeline"); list.innerHTML="";
  if(!currentVehicle) return;
  
  const all=[...currentVehicle.fuelEntries,...currentVehicle.maintenanceEntries].sort((a,b)=>new Date(b.date)-new Date(a.date));
  all.forEach(e=>{ 
      const li=document.createElement("li"); 
      li.textContent=e.type==="fuel"
          ? `⛽ ${e.date} — ${e.liters}L — ${e.totalCost}€ (${e.odometer} km)`
          : `🔧 ${e.date} — ${e.maintType} — ${e.cost}€ (${e.odometer} km)`; 
      list.appendChild(li); 
  });
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

  // Calcular consumos si hay suficientes datos
  const fuels=[...currentVehicle.fuelEntries].sort((a,b)=>a.odometer-b.odometer);
  if(fuels.length >= 2){ 
      let liters=0, costSub=0; 
      fuels.forEach(f=>{ liters+=f.liters; costSub+=f.totalCost; });
      
      const kmWindow = fuels[fuels.length-1].odometer - fuels[0].odometer; 
      
      if(kmWindow > 0) {
          const consumo=(liters/kmWindow)*100; 
          const costKm=costSub/kmWindow; // Coste combustible/km
          
          html += `
            <div style="background:#f1f5f9; padding:10px; border-radius:8px;">
                <div style="font-size:0.8rem; color:#64748b;">Consumo Medio</div>
                <div style="font-size:1.2rem; font-weight:bold; color:#0f172a;">${consumo.toFixed(2)} L/100</div>
            </div>
            <div style="background:#f1f5f9; padding:10px; border-radius:8px;">
                <div style="font-size:0.8rem; color:#64748b;">Coste/Km (Diesel/Gaso)</div>
                <div style="font-size:1.2rem; font-weight:bold; color:#0f172a;">${costKm.toFixed(3)} €</div>
            </div>`;
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
