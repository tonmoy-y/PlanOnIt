// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../src/App';
import { defaultPreferences } from '../src/data';

describe('shared browser workspace',()=>{
  let root:Root|undefined;
  let container:HTMLDivElement;
  const registered:WebMCPTool[]=[];

  beforeEach(()=>{
    localStorage.clear();registered.length=0;
    (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async(tool:WebMCPTool)=>{registered.push(tool)}}});
    container=document.createElement('div');document.body.append(container);root=createRoot(container);
  });

  afterEach(async()=>{if(root)await act(async()=>root?.unmount());container.remove();Object.defineProperty(document,'modelContext',{configurable:true,value:undefined});});

  it('registers real site tools and reflects their mutations in the UI',async()=>{
    await act(async()=>{root?.render(<App/>);await new Promise(resolve=>setTimeout(resolve,0));});
    expect(registered).toHaveLength(13);expect(container.textContent).toContain('Your agent can use this page');
    const create=registered.find(tool=>tool.name==='create_evening_plan');expect(create).toBeDefined();
    await act(async()=>{await create?.execute({city:'Dhaka',date:'2026-09-04',people:3,budget:5000,preferences:defaultPreferences(),dinnerDurationMinutes:75,bufferMinutes:15});});
    expect(container.textContent).toContain('Ready for review');
    expect(JSON.parse(localStorage.getItem('planonit.state.v5')??'{}')).toMatchObject({plan:{version:2,status:'valid'}});
  });
  it('keeps an invalid manual budget in the form and out of shared state',async()=>{
    await act(async()=>{root?.render(<App/>);await new Promise(resolve=>setTimeout(resolve,0));});
    const budget=container.querySelector<HTMLInputElement>('input[aria-label="Budget"]');expect(budget).not.toBeNull();
    await act(async()=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;setter?.call(budget,'-10');budget?.dispatchEvent(new Event('input',{bubbles:true}));budget?.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));});
    expect(container.textContent).toContain('Budget must be at least ৳500');expect(JSON.parse(localStorage.getItem('planonit.state.v5')??'{}')).toMatchObject({plan:{version:1,budget:5000}});
    expect(budget?.getAttribute('aria-invalid')).toBe('true');expect(budget?.getAttribute('aria-describedby')).toBe('budget-error');expect(container.querySelector('#budget-error')?.getAttribute('role')).toBe('alert');
  });
  it('does not create activity or a version when an unchanged field blurs',async()=>{await act(async()=>{root?.render(<App/>);await new Promise(resolve=>setTimeout(resolve,0));});const budget=container.querySelector<HTMLInputElement>('input[aria-label="Budget"]')!;await act(async()=>{budget.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,0));});expect(JSON.parse(localStorage.getItem('planonit.state.v5')??'{}')).toMatchObject({plan:{version:1,budget:5000},activity:[]});});
  it('shows repair evidence after a human constraint breaks an agent plan',async()=>{await act(async()=>{root?.render(<App/>);await new Promise(resolve=>setTimeout(resolve,0));});const create=registered.find(tool=>tool.name==='create_evening_plan')!;const update=registered.find(tool=>tool.name==='update_plan')!;await act(async()=>{await create.execute({city:'Dhaka',date:'2026-09-04',people:3,budget:5000,preferences:defaultPreferences()});await update.execute({expectedVersion:2,budget:4200});});await act(async()=>{container.querySelector<HTMLButtonElement>('nav button:nth-child(3)')?.click();});expect(container.textContent).toContain('NEEDS A FIX');const repair=[...container.querySelectorAll('button')].find(button=>button.textContent?.includes('Fix this for me'));expect(repair).toBeDefined();await act(async()=>{repair?.click();await new Promise(resolve=>setTimeout(resolve,0));});expect(container.textContent).toContain('PLAN REPAIRED');expect(container.textContent).toContain('Timing and budget now work');});
  it('keeps approval human-only and shows confirmation after the explicit clicks',async()=>{await act(async()=>{root?.render(<App/>);await new Promise(resolve=>setTimeout(resolve,0));});const create=registered.find(tool=>tool.name==='create_evening_plan')!;await act(async()=>{await create.execute({city:'Dhaka',date:'2026-09-04',people:3,budget:5000,preferences:defaultPreferences()});container.querySelector<HTMLButtonElement>('nav button:nth-child(3)')?.click();});const approve=[...container.querySelectorAll('button')].find(button=>button.textContent?.includes('Approve this evening'));expect(approve).toBeDefined();await act(async()=>{approve?.click();await new Promise(resolve=>setTimeout(resolve,0));});const confirm=[...container.querySelectorAll('button')].find(button=>button.textContent?.includes('Book this evening'));expect(confirm).toBeDefined();await act(async()=>{confirm?.click();await new Promise(resolve=>setTimeout(resolve,0));});expect(container.textContent).toContain('Reserved · confirmed');expect(container.textContent).toMatch(/SBX-CURRENT-PLAN-V\d+/);expect(container.textContent).toContain('3 people');expect(container.textContent).toContain('YOUR BOOKINGS');});
  it('presents restaurants by opening window and price band instead of raw capacity',async()=>{
    await act(async()=>{root?.render(<App/>);await new Promise(resolve=>setTimeout(resolve,0));});
    await act(async()=>{container.querySelector<HTMLButtonElement>('nav button:nth-child(2)')?.click();});
    const sections=[...container.querySelectorAll('.explore-section')];
    expect(sections[0].textContent).toContain('Movie');
    expect(sections[1].textContent).toContain('Dinner after the film');
    const dinner=sections[1].textContent??'';
    expect(dinner).toContain('Open 17:00–23:00');
    expect(dinner).toContain('/ person');
    expect(dinner).not.toMatch(/\d+ left/);
  });

  it('locks every editing control and hides dead-end actions on a reserved plan',async()=>{
    await act(async()=>{root?.render(<App/>);await new Promise(resolve=>setTimeout(resolve,0));});
    const create=registered.find(tool=>tool.name==='create_evening_plan')!;
    await act(async()=>{await create.execute({city:'Dhaka',date:'2026-09-04',people:3,budget:5000,preferences:defaultPreferences()});container.querySelector<HTMLButtonElement>('nav button:nth-child(3)')?.click();});
    const click=async(label:string)=>{const button=[...container.querySelectorAll('button')].find(item=>item.textContent?.includes(label));expect(button,label).toBeDefined();await act(async()=>{button?.click();await new Promise(resolve=>setTimeout(resolve,0));});};
    await click('Approve this evening');
    await click('Book this evening');
    expect(container.textContent).toContain('Reserved · confirmed');
    expect([...container.querySelectorAll('button')].some(item=>item.textContent?.includes('Fix this for me'))).toBe(false);
    expect([...container.querySelectorAll('button')].some(item=>item.textContent?.includes('Change my choices'))).toBe(false);
    await act(async()=>{container.querySelector<HTMLButtonElement>('nav button:nth-child(1)')?.click();});
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Budget"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Date"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="Transport preference"]')?.disabled).toBe(true);
    await act(async()=>{container.querySelector<HTMLButtonElement>('nav button:nth-child(2)')?.click();});
    expect(container.querySelector('.locked-banner')).not.toBeNull();
    expect([...container.querySelectorAll('.choice-action button')].every(button=>(button as HTMLButtonElement).disabled)).toBe(true);
  });

  it('resets only PlanOnIt state, after an explicit confirmation, without cancelling reservations',async()=>{
    localStorage.setItem('unrelated.site.key','keep-me');
    await act(async()=>{root?.render(<App/>);await new Promise(resolve=>setTimeout(resolve,0));});
    const create=registered.find(tool=>tool.name==='create_evening_plan')!;
    await act(async()=>{await create.execute({city:'Dhaka',date:'2026-09-04',people:3,budget:5000,preferences:defaultPreferences()});container.querySelector<HTMLButtonElement>('nav button:nth-child(3)')?.click();});
    const click=async(label:string)=>{const button=[...container.querySelectorAll('button')].find(item=>item.textContent?.includes(label));expect(button,label).toBeDefined();await act(async()=>{button?.click();await new Promise(resolve=>setTimeout(resolve,0));});};
    await click('Approve this evening');
    await click('Book this evening');
    const reservedVersion=JSON.parse(localStorage.getItem('planonit.state.v5')??'{}').plan.version as number;
    await click('Reset plan');
    const dialog=container.querySelector('[role="alertdialog"]');
    expect(dialog?.textContent).toContain('Only PlanOnIt');
    expect(dialog?.textContent).toContain('reset does not cancel');
    await click('Reset PlanOnIt');
    const stored=JSON.parse(localStorage.getItem('planonit.state.v5')??'{}');
    expect(stored.plan.version).toBeGreaterThan(reservedVersion);
    expect(stored.plan.selections).toEqual({});
    expect(stored.plan.reservation).toBeUndefined();
    expect(stored.activity).toEqual([]);
    expect(Object.keys(stored.provider.reservations)).toHaveLength(1);
    expect(localStorage.getItem('unrelated.site.key')).toBe('keep-me');
    localStorage.removeItem('unrelated.site.key');
  });

  /** BUG-3 regression at the UI boundary: a workspace persisted mid-reservation must load usable. */
  it('recovers a workspace persisted in reservation_pending instead of freezing it',async()=>{
    const click=async(label:string)=>{const button=[...container.querySelectorAll('button')].find(item=>item.textContent?.includes(label));expect(button,label).toBeDefined();await act(async()=>{button?.click();await new Promise(resolve=>setTimeout(resolve,0));});};
    await act(async()=>{root?.render(<App/>);await new Promise(resolve=>setTimeout(resolve,0));});
    await click('Create plan preview');
    await click('Approve this evening');
    const stored=JSON.parse(localStorage.getItem('planonit.state.v5')??'{}');
    const approvedVersion=stored.plan.version as number;
    // Simulate a tab that wrote the pending state and died before the authority answered.
    stored.plan.status='reservation_pending';
    stored.plan.reservation={id:'PENDING-CURRENT-PLAN',planId:stored.plan.id,version:approvedVersion,providerRevision:0,status:'pending',reservedAt:new Date().toISOString(),idempotencyKey:'fp1_stale',fingerprint:'fp1_stale',inventory:[{kind:'showtime',inventoryKey:stored.plan.selections.showtimeId,quantity:stored.plan.people,state:'held'}]};
    localStorage.setItem('planonit.state.v5',JSON.stringify(stored));
    await act(async()=>root?.unmount());
    container.remove();container=document.createElement('div');document.body.append(container);root=createRoot(container);
    await act(async()=>{root?.render(<App/>);await new Promise(resolve=>setTimeout(resolve,0));});
    const reloaded=JSON.parse(localStorage.getItem('planonit.state.v5')??'{}');
    expect(reloaded.plan.status).toBe('reservation_failed');
    expect(reloaded.plan.version).toBe(approvedVersion);
    expect(reloaded.plan.reservation.inventory.every((item:{state:string})=>item.state==='released')).toBe(true);
    expect(Object.keys(reloaded.provider.reservations)).toHaveLength(0);
    // And the human can approve again rather than being stuck behind a frozen pending state.
    expect([...container.querySelectorAll('button')].map(item=>item.textContent??'').join(' ')).not.toContain('Confirming with the provider');
    await click('Approve this evening');
    expect(JSON.parse(localStorage.getItem('planonit.state.v5')??'{}').plan.status).toBe('approved');
  });

  it('keeps all four navigation destinations keyboard-addressable',async()=>{await act(async()=>{root?.render(<App/>);await new Promise(resolve=>setTimeout(resolve,0));});const navigation=container.querySelector('nav[aria-label="Planning steps"]')!;const buttons=[...navigation.querySelectorAll('button')];expect(buttons.map(button=>button.textContent?.trim())).toEqual(['1. Goal','2. Explore','3. Plan','Activity']);for(const button of buttons){button.focus();expect(document.activeElement).toBe(button);}});
});
