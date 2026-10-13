import { shuffle } from './engine.js';
export const WORLD = { width: 1800, height: 1200 };
export const STATIONS = [
  { x: 900, y: 960, kind: 'bank', name: 'Spark vault', color: '#ffe078' },
  { x: 470, y: 360, kind: 'quiz', name: 'Charging pad', color: '#ad8cff' },
  { x: 1330, y: 360, kind: 'quiz', name: 'Charging pad', color: '#ad8cff' },
  { x: 900, y: 560, kind: 'shop', name: 'Upgrade garage', color: '#73e9e0' },
];
export const BLOCKS = [
  { x: 690, y: 170, w: 420, h: 170, kind: 'water' },
  { x: 220, y: 650, w: 310, h: 145, kind: 'water' },
  { x: 1270, y: 650, w: 310, h: 145, kind: 'water' },
  ...[[220,210],[580,200],[1220,200],[1560,210],[170,450],[1630,450],[600,580],[1200,580],[640,900],[1160,900],[380,1010],[1420,1010]].map(([x,y])=>({x,y,w:65,h:65,kind:'tree'})),
];
export const UPGRADES = [
  { id: 'speed', name: 'Turbo boots', price: 25, detail: 'Move 20% faster per level.', icon: '↗' },
  { id: 'magnet', name: 'Crystal magnet', price: 30, detail: 'Collect crystals from farther away.', icon: '◎' },
  { id: 'cargo', name: 'Bigger backpack', price: 20, detail: 'Carry 10 more crystals per level.', icon: '▣' },
  { id: 'shield', name: 'Energy shield', price: 35, detail: 'Block your next drone collision.', icon: '◇' },
];
export const distance = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function blocked(x,y,r=18) {
  return x < r || y < r || x > WORLD.width-r || y > WORLD.height-r || BLOCKS.some(b => x+r>b.x && x-r<b.x+b.w && y+r>b.y && y-r<b.y+b.h);
}
export function move(body,dx,dy) { if (!blocked(body.x+dx,body.y)) body.x+=dx; if(!blocked(body.x,body.y+dy)) body.y+=dy; }
export class FieldGame {
  constructor(quiz, random = Math.random) {
    this.quiz=quiz; this.random=random; this.time=180; this.elapsed=0; this.status='playing'; this.player={x:900,y:1060,energy:65,cargo:0,balance:0,score:0,speed:0,magnet:0,capacity:0,shield:false,streak:0,correct:0,answered:0,invincible:0,dashUntil:0,dashReady:0,facing:1};
    this.deck=[]; this.question=null; this.feedback=null; this.particles=[]; this.pickups=[]; this.message='Collect crystals, then bring them to the yellow vault!'; this.messageTime=6;
    this.bots=[{x:350,y:460,name:'Nova',color:'#ff91b1',cargo:0,score:0,speed:107},{x:1450,y:460,name:'Orbit',color:'#8cabff',cargo:0,score:0,speed:113},{x:900,y:410,name:'Pixel',color:'#ffa662',cargo:0,score:0,speed:100}];
    this.drones=[{x:790,y:720,cx:900,cy:730,phase:0},{x:360,y:500,cx:400,cy:510,phase:2.2},{x:1450,y:850,cx:1370,cy:880,phase:4.4}];
    for(let i=0;i<85;i++) this.spawn();
  }
  spawn() { for(let i=0;i<100;i++){ const x=70+this.random()*1660,y=80+this.random()*1000;if(!blocked(x,y,35)&&!STATIONS.some(s=>distance(s,{x,y})<90)){this.pickups.push({x,y,value:this.random()<.14?5:1,phase:this.random()*6});return;} } }
  say(text){this.message=text;this.messageTime=4;}
  burst(x,y,color,count=10){for(let i=0;i<count;i++)this.particles.push({x,y,vx:(this.random()-.5)*180,vy:(this.random()-.5)*180,life:.7,color});}
  station(){return STATIONS.find(s=>distance(s,this.player)<110);}
  recharge(){if(this.status!=='playing')return;this.status='quiz';if(!this.deck.length)this.deck=shuffle(this.quiz.questions,this.random);this.question=this.deck.pop();this.choices=shuffle(this.question.answers.map((text,index)=>({text,index})),this.random);this.feedback=null;}
  answer(index){if(this.status!=='quiz'||this.feedback||!Number.isInteger(index)||index<0||index>3)return false;const p=this.player,correct=index===this.question.correctIndex;p.answered++;if(correct){p.correct++;p.streak++;const amount=60+Math.min(20,p.streak*5);p.energy=Math.min(100,p.energy+amount);this.feedback={correct,amount};}else{p.streak=0;p.energy=Math.min(100,p.energy+15);this.feedback={correct,amount:15};}return this.feedback;}
  bank(){const p=this.player;if(this.status!=='playing'||distance(p,STATIONS[0])>110)return false;if(!p.cargo){this.say('Your backpack is empty. Find some crystals!');return false;}const amount=p.cargo;p.balance+=amount;p.score+=amount;p.cargo=0;this.burst(p.x,p.y,'#ffe078',25);this.say(`+${amount} banked! Spend sparks at the upgrade garage.`);return true;}
  buy(id){const p=this.player,item=UPGRADES.find(item=>item.id===id);if(!item||this.status!=='shop'||distance(p,STATIONS[3])>110)return false;const level=id==='cargo'?p.capacity:p[id];const cost=item.price*(id==='shield'?1:level+1);if(p.balance<cost||(id==='shield'?p.shield:level>=3))return false;p.balance-=cost;if(id==='shield')p.shield=true;else if(id==='cargo')p.capacity++;else p[id]++;return true;}
  dash(){const p=this.player;if(this.status!=='playing'||this.elapsed<p.dashReady||p.energy<12)return false;p.energy-=12;p.dashUntil=this.elapsed+.22;p.dashReady=this.elapsed+2;return true;}
  step(dt,input={x:0,y:0}){
    if(this.status!=='playing')return;dt=Math.min(dt,.05);this.elapsed+=dt;this.time=Math.max(0,this.time-dt);if(!this.time){this.status='ended';return;}
    const p=this.player;this.messageTime=Math.max(0,this.messageTime-dt);p.invincible=Math.max(0,p.invincible-dt);
    const length=Math.hypot(input.x,input.y);if(length&&p.energy>0){const speed=(170+p.speed*34)*(this.elapsed<p.dashUntil?3.1:1);move(p,input.x/length*speed*dt,input.y/length*speed*dt);p.energy=Math.max(0,p.energy-dt*2);if(input.x)p.facing=Math.sign(input.x);}
    for(let i=this.pickups.length-1;i>=0;i--){const gem=this.pickups[i];if(distance(p,gem)<30+p.magnet*24&&p.cargo<20+p.capacity*10){const amount=Math.min(gem.value,20+p.capacity*10-p.cargo);p.cargo+=amount;this.pickups.splice(i,1);this.burst(gem.x,gem.y,gem.value===5?'#ffde79':'#83ffb6',5);this.spawn();}}
    for(const bot of this.bots){let target=bot.cargo>=14?STATIONS[0]:this.pickups.reduce((a,b)=>distance(bot,a)<distance(bot,b)?a:b,this.pickups[0]??STATIONS[0]);let dx=target.x-bot.x,dy=target.y-bot.y,d=Math.hypot(dx,dy);if(d>5){const oldX=bot.x,oldY=bot.y;move(bot,dx/d*bot.speed*dt,dy/d*bot.speed*dt);if(bot.x===oldX&&bot.y===oldY){move(bot,Math.cos(this.elapsed+bot.speed)*bot.speed*dt,Math.sin(this.elapsed+bot.speed)*bot.speed*dt);}}
      if(bot.cargo>=14&&distance(bot,STATIONS[0])<75){bot.score+=bot.cargo;bot.cargo=0;}
      if(bot.cargo<14){const idx=this.pickups.findIndex(g=>distance(bot,g)<24);if(idx>=0){bot.cargo+=this.pickups[idx].value;this.pickups.splice(idx,1);this.spawn();}}
    }
    for(const drone of this.drones){drone.x=drone.cx+Math.cos(this.elapsed*.8+drone.phase)*150;drone.y=drone.cy+Math.sin(this.elapsed*1.15+drone.phase)*75;if(distance(p,drone)<40&&!p.invincible){p.invincible=2.5;this.burst(p.x,p.y,'#ff8f98',20);if(p.shield){p.shield=false;this.say('Shield blocked the drone!');}else{const loss=Math.min(p.cargo,5);p.cargo-=loss;p.energy=Math.max(0,p.energy-8);this.say(`Drone hit! ${loss} crystals dropped. Bank often!`);for(let i=0;i<loss;i++)this.pickups.push({x:p.x+(this.random()-.5)*100,y:p.y+(this.random()-.5)*100,value:1,phase:0});}move(p,(p.x-drone.x)*1.5,(p.y-drone.y)*1.5);}}
    for(const particle of this.particles){particle.life-=dt;particle.x+=particle.vx*dt;particle.y+=particle.vy*dt;}this.particles=this.particles.filter(p=>p.life>0);
  }
}
