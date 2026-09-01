// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { initialPlan } from '../src/data';
import { loadState, saveState } from '../src/persistence';

describe('local persistence adapter',()=>{beforeEach(()=>localStorage.clear());it('restores plan version and history after reload',()=>{const plan=initialPlan();plan.version=7;saveState(plan,[{id:'a',text:'Changed plan',detail:'Human edit',source:'human',timestamp:new Date().toISOString(),planVersion:7}]);const loaded=loadState();expect(loaded.plan.version).toBe(7);expect(loaded.activity[0].text).toBe('Changed plan');});it('recovers safely from malformed storage',()=>{localStorage.setItem('planonit.state.v2','{"plan":"bad"}');expect(loadState().plan.version).toBe(1);});});
