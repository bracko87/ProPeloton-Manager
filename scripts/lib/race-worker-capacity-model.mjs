// Deterministic WHAT-IF capacity model. This is not a production load test:
// service times are caller-provided observations or explicitly synthetic inputs.
// The same in-game start schedule is evaluated at independent game-clock speeds.
export function simulateRaceWorkerCapacity({
  stages, gameSpeed, workerSlots = 3,
  calculationLeadGameMinutes = 180,
  publicationSlackGameMinutes = 30,
}) {
  if (!Array.isArray(stages) || !Number.isFinite(gameSpeed) || gameSpeed<=0) throw Error("Invalid scenario");
  if (!Number.isInteger(workerSlots) || workerSlots<1) throw Error("Invalid worker slots");
  const queue = stages.map((stage,index)=>{
    if (!Number.isFinite(stage.startGameMinute) ||
        !Number.isFinite(stage.workerServiceRealMinutes) || stage.workerServiceRealMinutes<0) {
      throw Error("Invalid race input");
    }
    return {
      id:String(stage.id??index),
      requestedAt:(stage.startGameMinute-calculationLeadGameMinutes)/gameSpeed,
      dueAt:(stage.startGameMinute+publicationSlackGameMinutes)/gameSpeed,
      prestartDueAt:stage.startGameMinute/gameSpeed,
      service:stage.workerServiceRealMinutes,
    };
  }).sort((a,b)=>a.requestedAt-b.requestedAt || a.dueAt-b.dueAt || a.id.localeCompare(b.id));
  const available=Array.from({length:workerSlots},()=>Number.NEGATIVE_INFINITY);
  const records=[];
  for(const job of queue){
    let index=0;
    for(let i=1;i<available.length;i++){
      if(available[i]<available[index])index=i;
    }
    const start=Math.max(job.requestedAt,available[index]);
    const finish=start+job.service;
    available[index]=finish;
    records.push({
      id:job.id,worker:index,queuedMinutes:Math.max(0,start-job.requestedAt),
      start,finish,latePrestart:finish>job.prestartDueAt,
      latePublication:finish>job.dueAt,
    });
  }
  const delays=records.map(r=>r.queuedMinutes).sort((a,b)=>a-b);
  return {
    gameSpeed,workerSlots,total:records.length,
    latePrestart:records.filter(r=>r.latePrestart).length,
    latePublication:records.filter(r=>r.latePublication).length,
    queueP95Minutes:delays.length?Number(delays[Math.ceil(delays.length*.95)-1].toFixed(2)):0,
    records,
  };
}
