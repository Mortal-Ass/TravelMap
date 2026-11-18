import test from 'node:test';
import assert from 'node:assert/strict';
import {transitOptions} from '../src/transit.js';
test('换乘方案保留站序、步行总长和换乘次数',()=>{
 const bus=(name:string)=>({buslines:[{name,departure_stop:{name:'甲'},arrival_stop:{name:'乙'}}]});
 const [result]=transitOptions([{cost:{duration:'600'},segments:[{walking:{distance:'100'},bus:bus('公交')},{walking:{distance:'30'},bus:bus('地铁') }]}]);
 assert.equal(result.duration,600);
 assert.equal(result.walking,130);
 assert.equal(result.transfers,1);
 assert.deepEqual(result.steps,['步行 100 米','公交 · 甲 上车 · 乙 下车','步行 30 米','地铁 · 甲 上车 · 乙 下车']);
});
