import { describe, expect, it } from 'vitest';
import { redact } from '../src/main/logging/redact';
import { validateHotkey, hotkeyWarning, hotkeyLabel } from '../src/shared/release';
import { needsApproval } from '../src/main/tools/approval';
import { stepPtt, initialPtt } from '../src/main/input/pttMachine';
describe('release privacy and input boundaries', () => {
  it('redacts keys, content, images and error messages instead of relying on key prefixes', () => {
    expect(redact({ apiKey:'sk-secret', token:'gsk_secret', transcript:'private', screenshot:new Uint8Array([1]), message:'private', code:'EACCES', durationMs:42, headers:{authorization:'Bearer secret'}, ok:true })).toEqual({code:'EACCES',durationMs:42,ok:true});
    expect(redact('raw sensitive error')).toEqual({});expect(redact({code:'PRIVATE_TEXT',durationMs:NaN})).toEqual({});
  });
  it('accepts modifier-only pairs and rejects typing keys and duplicates', () => {
    expect(validateHotkey(['Control','Meta'])).toBe(true);expect(validateHotkey(['Alt','Shift'])).toBe(true);
    for(const c of [['Control'],['Control','A'],['Meta','Meta'],null])expect(validateHotkey(c)).toBe(false);
    expect(hotkeyWarning(['Alt','Shift'])).toMatch(/languages/);expect(hotkeyLabel(['Control','Meta'])).toBe('Ctrl + Win');
  });
  it('keeps sensitive tools confirmed even if a stale preference tries to disable them', () => {
    for(const name of ['type_text','read_clipboard','write_clipboard','read_screen'])expect(needsApproval({name,kind:'action',approvalRequired:false})).toBe(true);
    expect(needsApproval({name:'web_search',kind:'action',approvalRequired:false})).toBe(false);
  });
  it('custom modifier PTT stops on either release and blocks accidental typing', () => {
    let s=initialPtt();for(const key of ['Alt','Shift'])s=stepPtt(s,{key,down:true,now:0},['Alt','Shift']).state;
    expect(s.holding).toBe(true);expect(stepPtt(s,{key:'Shift',down:false,now:400},['Alt','Shift']).action).toBe('stop');
    expect(stepPtt(s,{key:'A',down:true,now:300},['Alt','Shift']).action).toBe('cancel');
  });
});
