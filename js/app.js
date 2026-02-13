let data; let currentVehicle;

async function start() {
  data = await loadData();
  // Validar estructura de data
  if (!data || typeof data !== 'object') data = { vehicles: [] };
  if (!data.vehicles) data.vehicles = [];

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
  renderVehicleSelect(); 
  renderVehicleInfo(); // Nueva función
  renderTimeline(); 
  renderReminders(); 
  renderStats(); 
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
  
  const fuels=[...currentVehicle.fuelEntries].sort((a,b)=>a.odometer-b.odometer);
  if(fuels.length<2){ 
      div.innerHTML = `<p>KM Actuales: <b>${currentTotalKm} km</b></p><p>Faltan datos de repostaje para calcular consumos.</p>`; 
      return; 
  }
  
  let liters=0, cost=0; 
  fuels.forEach(f=>{ liters+=f.liters; cost+=f.totalCost; });
  
  // Distancia recorrida (usando repostajes para calculo de consumo promedio real)
  const kmWindow = fuels[fuels.length-1].odometer - fuels[0].odometer; 
  
  let html = `<p>Kilometraje Actual: <b>${currentTotalKm} km</b></p>`;
  
  if(kmWindow > 0) {
      const consumo=(liters/kmWindow)*100; 
      const costKm=cost/kmWindow;
      html += `
        <p>Consumo medio (histórico): <b>${consumo.toFixed(2)} L/100km</b></p>
        <p>Coste por km (combustible): <b>${costKm.toFixed(3)} €/km</b></p>
      `;
  }
  
  div.innerHTML=html;
}

// ---------------- RECORDATORIOS EDITABLES ----------------
function renderReminders(){
  const tbody=document.querySelector("#reminderTable tbody"); tbody.innerHTML="";
  if(!currentVehicle) return;

  currentVehicle.reminders.forEach((r,index)=>{
    // Retrocompatibilidad: convertir intervalDays a visualización Meses (aprox) si no tiene unit
    let timeVal = 0;
    let timeUnit = 'months'; // default
    
    if (r.intervalMonths) {
       timeVal = r.intervalMonths;
       timeUnit = 'months';
    } else if (r.intervalYears) {
       timeVal = r.intervalYears;
       timeUnit = 'years';
    } else if (r.intervalDays) {
       // Si es legacy data en dias, convertimos visualmente a meses
       timeVal = Math.round(r.intervalDays / 30);
       timeUnit = 'months';
    }

    const tr=document.createElement("tr");
    tr.innerHTML=`
      <td><input type="text" value="${r.title}" onchange="updateReminder(${index},'title',this.value)"></td>
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
  currentVehicle.reminders[index][field]=value; saveData(data);
}

function deleteReminder(index){
  if(!confirm("¿Eliminar este recordatorio?")) return;
  currentVehicle.reminders.splice(index,1); renderReminders(); saveData(data);
}

// Expose start to global scope so storage.js or login flow can call it
window.startApp = start;

// Initial check
(async function boot() {
  const token = sessionStorage.getItem("githubToken");
  if(token) {
    // Basic UI switch, validation happens in loadData or we let it fail
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app-container").classList.remove("hidden");
    // Esperar a que cargue el DOM
    if (document.readyState === 'loading') {
       document.addEventListener('DOMContentLoaded', start);
    } else {
       await start();
    }
  } else {
    document.getElementById("login-screen").classList.remove("hidden");
  }
})();
