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

function init(){ renderVehicleSelect(); renderTimeline(); renderReminders(); renderStats(); }

function renderVehicleSelect() {
  const select=document.getElementById("vehicleSelect"); select.innerHTML="";
  data.vehicles.forEach(v=>{ const opt=document.createElement("option"); opt.value=v.id; opt.textContent=v.name; select.appendChild(opt); });
  if (currentVehicle) select.value=currentVehicle.id;
  
  select.onchange=()=>{ 
      currentVehicle=data.vehicles.find(v=>v.id===select.value); 
      renderTimeline(); renderReminders(); renderStats(); 
  };
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
  
  const fuels=[...currentVehicle.fuelEntries].sort((a,b)=>a.odometer-b.odometer);
  if(fuels.length<2){ div.textContent="No hay datos suficientes (min 2 repostajes)."; return; }
  
  let liters=0, cost=0; 
  // Calcular consumo entre el primer y ultimo repostaje
  // Excluimos el primer llenado para el calculo de consumo si queremos ser estrictos (metodo lleno-lleno), 
  // pero para simplificar sumamos todo y dividimos por km totales recorridos en ese periodo.
  // Mejor aproximación simple: (Litros totales / KM totales) * 100
  
  fuels.forEach(f=>{ liters+=f.liters; cost+=f.totalCost; });
  const km=fuels[fuels.length-1].odometer-fuels[0].odometer; 
  
  if(km <= 0) { div.textContent="Error en datos de kilometraje."; return; }
  
  const consumo=(liters/km)*100; 
  const costKm=cost/km;
  
  div.innerHTML=`
    <p>Distancia registrada: <b>${km} km</b></p>
    <p>Consumo medio: <b>${consumo.toFixed(2)} L/100km</b></p>
    <p>Coste por km: <b>${costKm.toFixed(3)} €/km</b></p>
  `;
}

// ---------------- RECORDATORIOS EDITABLES ----------------
function renderReminders(){
  const tbody=document.querySelector("#reminderTable tbody"); tbody.innerHTML="";
  if(!currentVehicle) return;

  currentVehicle.reminders.forEach((r,index)=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`
      <td><input type="text" value="${r.title}" onchange="updateReminder(${index},'title',this.value)"></td>
      <td><input type="number" value="${r.intervalKm}" onchange="updateReminder(${index},'intervalKm',this.value)"></td>
      <td><input type="number" value="${r.intervalDays||''}" onchange="updateReminder(${index},'intervalDays',this.value)"></td>
      <td><button onclick="deleteReminder(${index})" class="btn-danger">❌</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function addReminder(){ 
  const r={ title:"Nuevo mantenimiento", intervalKm:0, intervalDays:0, lastOdometer:0, lastDate:null };
  currentVehicle.reminders.push(r); renderReminders(); saveData(data);
}

function updateReminder(index,field,value){
  if(field==='intervalKm'||field==='intervalDays') value=Number(value);
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
