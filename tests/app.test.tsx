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
    expect(registered).toHaveLength(12);expect(container.textContent).toContain('WebMCP active · 12 tools');
    const create=registered.find(tool=>tool.name==='create_evening_plan');expect(create).toBeDefined();
    await act(async()=>{await create?.execute({city:'Dhaka',date:'2026-09-04',people:3,budget:5000,preferences:defaultPreferences(),dinnerDurationMinutes:75,bufferMinutes:15});});
    expect(container.textContent).toContain('PLAN VERSION 2 · VALID');
    expect(JSON.parse(localStorage.getItem('planonit.state.v2')??'{}')).toMatchObject({plan:{version:2,status:'valid'}});
  });
});
