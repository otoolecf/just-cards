import { expect, it } from 'vitest';
import { rosterStandings } from './roster-standings';
it('keeps entry order while low-score leaders change',()=>{
 const roster=['Sally','Bob','Jim'];
 expect(rosterStandings(roster,{Sally:20,Bob:5,Jim:10},'low_wins').map(r=>[r.player,r.rankLabel])).toEqual([['Sally','3rd'],['Bob','1st'],['Jim','2nd']]);
 expect(rosterStandings(roster,{Sally:20,Bob:25,Jim:10},'low_wins').map(r=>r.player)).toEqual(roster);
});
it('ranks high wins, shared places, and unscored players without sorting rows',()=>{
 const rows=rosterStandings(['Sally','Bob','Jim'],{Bob:12,Jim:12},'high_wins');
 expect(rows.map(r=>[r.total,r.rankLabel])).toEqual([[0,'3rd'],[12,'Tied 1st'],[12,'Tied 1st']]);
 expect(rows.map(r=>r.rank)).toEqual([3,1,1]);
 expect(rosterStandings(['Sally'],{},'low_wins')).toEqual([]);
});
it('formats teen and later ordinal ranks correctly',()=>{
 const players=Array.from({length:23},(_,i)=>String(i));
 const rows=rosterStandings(players,Object.fromEntries(players.map((p,i)=>[p,i])),'low_wins');
 expect([10,11,12,20,21,22].map(i=>rows[i].rankLabel)).toEqual(['11th','12th','13th','21st','22nd','23rd']);
});
