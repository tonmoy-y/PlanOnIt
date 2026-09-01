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
    expect(registered).toHaveLength(12);expect(container.textContent).toContain('Agent-ready · 12 tools');
    const create=registered.find(tool=>tool.name==='create_evening_plan');expect(create).toBeDefined();
    await act(async()=>{await create?.execute({city:'Dhaka',date:'2026-09-04',people:3,budget:5000,preferences:defaultPreferences(),dinnerDurationMinutes:75,bufferMinutes:15});});
    expect(container.textContent).toContain('Ready to review');
    expect(JSON.parse(localStorage.getItem('planonit.state.v4')??'{}')).toMatchObject({plan:{version:2,status:'valid'}});
  });
  it('keeps an invalid manual budget in the form and out of shared state',async()=>{
    await act(async()=>{root?.render(<App/>);await new Promise(resolve=>setTimeout(resolve,0));});
    const budget=container.querySelector<HTMLInputElement>('input[aria-label="Budget"]');expect(budget).not.toBeNull();
    await act(async()=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;setter?.call(budget,'-10');budget?.dispatchEvent(new Event('input',{bubbles:true}));budget?.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));});
    expect(container.textContent).toContain('Budget must be at least ৳500');expect(JSON.parse(localStorage.getItem('planonit.state.v4')??'{}')).toMatchObject({plan:{version:1,budget:5000}});
    expect(budget?.getAttribute('aria-invalid')).toBe('true');expect(budget?.getAttribute('aria-describedby')).toBe('budget-error');expect(container.querySelector('#budget-error')?.getAttribute('role')).toBe('alert');
  });
  it('does not create activity or a version when an unchanged field blurs',async()=>{await act(async()=>{root?.render(<App/>);await new Promise(resolve=>setTimeout(resolve,0));});const budget=container.querySelector<HTMLInputElement>('input[aria-label="Budget"]')!;await act(async()=>{budget.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,0));});expect(JSON.parse(localStorage.getItem('planonit.state.v4')??'{}')).toMatchObject({plan:{version:1,budget:5000},activity:[]});});
  it('shows repair evidence after a human constraint breaks an agent plan',async()=>{await act(async()=>{root?.render(<App/>);await new Promise(resolve=>setTimeout(resolve,0));});const create=registered.find(tool=>tool.name==='create_evening_plan')!;const update=registered.find(tool=>tool.name==='update_plan')!;await act(async()=>{await create.execute({city:'Dhaka',date:'2026-09-04',people:3,budget:5000,preferences:defaultPreferences()});await update.execute({expectedVersion:2,budget:4800});});await act(async()=>{container.querySelector<HTMLButtonElement>('nav button:nth-child(3)')?.click();});expect(container.textContent).toContain('PLAN NEEDS ATTENTION');const repair=[...container.querySelectorAll('button')].find(button=>button.textContent?.includes('Repair plan now'));expect(repair).toBeDefined();await act(async()=>{repair?.click();await new Promise(resolve=>setTimeout(resolve,0));});expect(container.textContent).toContain('PLAN REPAIRED');expect(container.textContent).toContain('Budget and schedule checks now pass');});
  it('keeps approval human-only and shows confirmation after the explicit clicks',async()=>{await act(async()=>{root?.render(<App/>);await new Promise(resolve=>setTimeout(resolve,0));});const create=registered.find(tool=>tool.name==='create_evening_plan')!;await act(async()=>{await create.execute({city:'Dhaka',date:'2026-09-04',people:3,budget:5000,preferences:defaultPreferences()});container.querySelector<HTMLButtonElement>('nav button:nth-child(3)')?.click();});const approve=[...container.querySelectorAll('button')].find(button=>button.textContent?.includes('Approve this plan'));expect(approve).toBeDefined();await act(async()=>{approve?.click();await new Promise(resolve=>setTimeout(resolve,0));});const confirm=[...container.querySelectorAll('button')].find(button=>button.textContent?.includes('Confirm sandbox reservation'));expect(confirm).toBeDefined();await act(async()=>{confirm?.click();await new Promise(resolve=>setTimeout(resolve,0));});expect(container.textContent).toContain('Reservation confirmed');expect(container.textContent).toContain('Sandbox provider inventory committed');});
  it('keeps all four navigation destinations keyboard-addressable',async()=>{await act(async()=>{root?.render(<App/>);await new Promise(resolve=>setTimeout(resolve,0));});const navigation=container.querySelector('nav[aria-label="Planning steps"]')!;const buttons=[...navigation.querySelectorAll('button')];expect(buttons.map(button=>button.textContent?.trim())).toEqual(['1. Goal','2. Explore','3. Plan','Activity']);for(const button of buttons){button.focus();expect(document.activeElement).toBe(button);}});
});
