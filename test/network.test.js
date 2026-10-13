import test from 'node:test';
import assert from 'node:assert/strict';
import { OnlineRoom } from '../static/network.js';
import { FieldGame } from '../static/field.js';
const quiz={questions:[{prompt:'test',answers:['a','b','c','d'],correctIndex:0}]};
test('online host shares one crystal pool and keeps player scores separate',()=>{
 const room=new OnlineRoom({onState(){},onLobby(){},onError(){},onStart(){}});room.isHost=true;room.started=true;room.name='Host';room.game=new FieldGame(quiz);room.game.bots=[];
 const state=new FieldGame(quiz);state.bots=[];state.player.x=room.game.player.x;const member={id:'friend',name:'Friend',token:'private',state,connected:true,input:{x:0,y:0},lastInput:performance.now(),conn:{open:true,send(){}}};room.members.set(member.id,member);
 room.game.pickups=[{x:900,y:1060,value:5,phase:0}];room.step(.05,{x:0,y:0});assert.equal(room.game.player.cargo,5);assert.equal(state.player.cargo,0);
 room.game.bank();assert.equal(room.game.player.score,5);assert.equal(state.player.score,0);const snap=room.snapshot(member);assert.equal(snap.bots[0].score,5);assert.equal(snap.bots[0].name,'Host');assert.equal(snap.player.score,0);assert.equal(JSON.stringify(snap).includes('private'),false);
});
test('online recharge has a cooldown and round expiration reaches peers',()=>{
 const room=new OnlineRoom({});room.isHost=true;room.started=true;room.game=new FieldGame(quiz);room.game.bots=[];room.game.player.energy=0;
 room.recharge(room.game);assert.equal(room.game.player.energy,60);room.recharge(room.game);assert.equal(room.game.player.energy,60);
 room.game.time=.01;room.step(.05,{x:0,y:0});assert.equal(room.snapshot().status,'ended');assert.equal(room.game.time,0);
});
