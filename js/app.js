let data; let currentVehicle;

async function start() {
  data = await loadData();
  if (!data.vehicles || data.vehicles.length===0){ data.vehicles=[]; addVehicle(); return; }
  currentVehicle = data.vehicles[0]; init();
}

function init(){ renderVehicleSelect(); renderTimeline(); renderReminders(); renderStats(); }

function renderVehicleSelect() {
  const select=document.getElementById("vehicleSelect"); select.innerHTML="";
  data.vehicles.forEach(v=>{ const opt=document.createElement("option"); opt.value=v.id; opt.textContent=v.name; select.appendChild(opt); });
  select.value=currentVehicle.id;
  select.onchange=()=>{ currentVehicle=data.vehicles.find(v=>v.id===select.value); renderTimeline(); renderReminders(); renderStats(); };
}

function addVehicle() {
  const name=prompt("Nombre del coche:"); if(!name) return;
  const v={ id:"car_"+Date.now(), name, fuelEntries:[], maintenanceEntries:[], reminders:[] };
  data.vehicles.push(v); currentVehicle=v;
  renderVehicleSelect(); renderTimeline(); renderReminders(); renderStats(); saveData(data);
}

function addFuel() {
  const entry={ type:"fuel", date:fuelDate.value, odometer:Number(fuelOdo.value), liters:Number(fuelLiters.value), totalCost:Number(fuelCost.value)};
  currentVehicle.fuelEntries.push(entry); saveData(data); renderTimeline(); renderReminders(); renderStats();
}

function addMaintenance() {
  const typeValue=document.getElementById("maintType").value;
  const entry={ type:"maintenance", date:maintDate.value, maintType:typeValue, odometer:Number(maintOdo.value), cost:Number(maintCost.value)};
  currentVehicle.maintenanceEntries.push(entry); saveData(data); renderTimeline(); renderStats();
}

function renderTimeline() {
  const list=document.getElementById("timeline"); list.innerHTML="";
  const all=[...currentVehicle.fuelEntries,...currentVehicle.maintenanceEntries].sort((a,b)=>new Date(b.date)-new Date(a.date));
  all.forEach(e=>{ const li=document.createElement("li"); li.textContent=e.type==="fuel"?`⛽ ${e.date} — ${e.liters}L — ${e.totalCost}€`:`🔧 ${e.date} — ${e.maintType} — ${e.cost}€`; list.appendChild(li); });
}

function renderStats() {
  const div=document.getElementById("stats"); const fuels=[...currentVehicle.fuelEntries].sort((a,b)=>a.odometer-b.odometer);
  if(fuels.length<2){ div.textContent="No hay datos suficientes."; return; }
  let liters=0, cost=0; fuels.forEach(f=>{ liters+=f.liters; cost+=f.totalCost; });
  const km=fuels[fuels.length-1].odometer-fuels[0].odometer; const consumo=(liters/km)*100; const costKm=cost/km;
  div.innerHTML=`Consumo medio: <b>${consumo.toFixed(2)} L/100km</b><br>Coste por km: <b>${costKm.toFixed(3)} €/km</b>`;
}

// ---------------- RECORDATORIOS EDITABLES ----------------
function renderReminders(){
  const tbody=document.querySelector("#reminderTable tbody"); tbody.innerHTML="";
  currentVehicle.reminders.forEach((r,index)=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`
      <td><input type="text" value="${r.title}" onchange="updateReminder(${index},'title',this.value)"></td>
      <td><input type="number" value="${r.intervalKm}" onchange="updateReminder(${index},'intervalKm',this.value)"></td>
      <td><input type="number" value="${r.intervalDays||''}" onchange="updateReminder(${index},'intervalDays',this.value)"></td>
      <td><button onclick="deleteReminder(${index})">❌</button></td>
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

start();
