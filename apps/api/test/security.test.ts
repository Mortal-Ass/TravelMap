import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword,verifyPassword,digest,token} from '../src/security.js';
test('密码使用随机盐，验证正确密码并拒绝错误密码',async()=>{const a=await hashPassword('correct-password');const b=await hashPassword('correct-password');assert.notEqual(a,b);assert.equal(await verifyPassword('correct-password',a),true);assert.equal(await verifyPassword('wrong-password',a),false);});
test('会话令牌随机且数据库只存摘要',()=>{const a=token();assert.notEqual(a,token());assert.notEqual(a,digest(a));assert.equal(digest(a).length,64);});
