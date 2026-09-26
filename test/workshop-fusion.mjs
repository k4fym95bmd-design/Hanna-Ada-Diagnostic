import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWorkshopDashboard,compareVerifiedDtcScans,summarizeLivePid} from '../public/workshop-fusion.js';

const ecu = {epoch:4,stage:'ECU',protocol:'legacy',pids:[0x0c,0x05,0x06,0x07,0x10],dtcs:null};
test('empty and Bluetooth-only sessions cannot claim an ECU or BMW modules',()=>{
 for(const state of [null,{epoch:0,stage:'DISCONNECTED',pids:null},{epoch:1,stage:'BLE',pids:null}]){
  const view=buildWorkshopDashboard(state);
  assert.equal(view.genericEcuVerified,false);
  assert.equal(view.bmwModulesVerified,false);
  assert.equal(view.groups.every(group=>group.status==='locked'),true);
 }
});
test('only confirmed session PIDs unlock observable live-data groups',()=>{
 const view=buildWorkshopDashboard(ecu);
 assert.equal(view.genericEcuVerified,true);
 assert.equal(view.protocol,'legacy');
 assert.equal(view.bmwModulesVerified,false);
 assert.deepEqual(view.groups.find(group=>group.id==='ignition-context').availablePids,[0x0c,0x05,0x06,0x07,0x10]);
 assert.equal(JSON.stringify(view).includes('VIN'),false);
});
test('unconfirmed pre/post, missing scan, different vehicle or reversed times remain unavailable',()=>{
 const a={status:'verified',scope:'generic-obd',vehicleKey:'local-a',protocol:'legacy',recordedAt:10,codes:['P0308']};
 const b={...a,recordedAt:11,codes:[]};
 for(const [before,after,opts] of [[a,b,{}],[null,b,{sameVehicleConfirmed:true}],[a,{...b,vehicleKey:'different'},{sameVehicleConfirmed:true}],[b,a,{sameVehicleConfirmed:true}],[a,{...b,codes:['FAKE']},{sameVehicleConfirmed:true}]]){
  assert.equal(compareVerifiedDtcScans(before,after,opts).status,'unavailable');
 }
});
test('verified same-vehicle scans identify changes but never assert a repair succeeded',()=>{
 const before={status:'verified',scope:'generic-obd',vehicleKey:'local-a',protocol:'legacy',recordedAt:10,codes:['P0308','P0171']};
 const after={...before,recordedAt:11,codes:['P0171','P0420']};
 const result=compareVerifiedDtcScans(before,after,{sameVehicleConfirmed:true});
 assert.equal(result.status,'verified-comparison');
 assert.deepEqual(result.resolved,['P0308']);
 assert.deepEqual(result.persisting,['P0171']);
 assert.deepEqual(result.newCodes,['P0420']);
 assert.equal(result.repairVerified,false);
 assert.equal(JSON.stringify(result).includes('local-a'),false);
});
test('live summaries require timestamped verified samples, never fabricate missing data or ranges',()=>{
 assert.equal(summarizeLivePid([]).status,'unavailable');
 assert.equal(summarizeLivePid([{at:1,value:42,verified:false}]).status,'unavailable');
 assert.equal(summarizeLivePid([{at:2,value:10,verified:true},{at:1,value:11,verified:true}]).status,'unavailable');
 const result=summarizeLivePid([{at:1,value:10,verified:true},{at:2,value:30,verified:true},{at:3,value:20,verified:true}]);
 assert.deepEqual(result,{status:'verified-summary',count:3,min:10,max:30,average:20,durationMs:2,referenceRange:null});
});
test('guided next step follows verified connection stages and never enables write actions',()=>{
 assert.equal(buildWorkshopDashboard(null).nextStep.code,'CONNECT_ADAPTER');
 assert.equal(buildWorkshopDashboard({epoch:1,stage:'BLE',pids:null}).nextStep.code,'IDENTIFY_ADAPTER');
 assert.equal(buildWorkshopDashboard({epoch:1,stage:'ADAPTER',pids:null}).nextStep.code,'VERIFY_GENERIC_ECU');
 assert.equal(buildWorkshopDashboard({...ecu,protocol:'unknown'}).nextStep.code,'IDENTIFY_PROTOCOL');
 const ready=buildWorkshopDashboard(ecu);
 assert.equal(ready.nextStep.code,'READ_GENERIC_DTC');
 assert.equal(ready.writesEnabled,false);
});
test('extreme finite samples cannot overflow to an invented numeric average',()=>{
 const result=summarizeLivePid([{at:1,value:1e308,verified:true},{at:2,value:1e308,verified:true}]);
 assert.notEqual(result.average,Infinity);
});
