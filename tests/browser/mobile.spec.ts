import { expect, Page, test } from '@playwright/test';
import { MOBILE_VIEWPORTS } from '../../playwright.config';

// A stub WebMCP host so the real registration path runs in a real browser.
const installModelContext=async(page:Page)=>page.addInitScript(()=>{
  const registered:Array<{name:string}>=[];
  (window as unknown as {__planonitTools:Array<{name:string}>}).__planonitTools=registered;
  Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async(tool:{name:string})=>{registered.push(tool);}}});
});

const noHorizontalOverflow=async(page:Page,width:number)=>{
  const scrollWidth=await page.evaluate(()=>document.documentElement.scrollWidth);
  expect(scrollWidth,'document must not scroll horizontally').toBeLessThanOrEqual(width+1);
  const offenders=await page.evaluate((limit)=>[...document.querySelectorAll('body *')]
    .filter(node=>node.getBoundingClientRect().right>limit+1)
    .map(node=>`${node.tagName}.${(node as HTMLElement).className||'-'}`).slice(0,5),width);
  expect(offenders,'no element may extend past the viewport').toEqual([]);
};

const tapTargets=async(page:Page,selector:string)=>page.evaluate(sel=>[...document.querySelectorAll(sel)]
  .filter(node=>(node as HTMLElement).offsetParent!==null)
  .map(node=>{const box=node.getBoundingClientRect();return {label:(node.textContent??'').trim().slice(0,24),height:Math.round(box.height),width:Math.round(box.width)};}),selector);

for(const viewport of MOBILE_VIEWPORTS){
  test.describe(`${viewport.name} (${viewport.width}x${viewport.height})`,()=>{
    test.use({viewport:{width:viewport.width,height:viewport.height}});

    test('registers every WebMCP tool and lays out without horizontal overflow',async({page})=>{
      await installModelContext(page);
      const consoleErrors:string[]=[];
      page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
      await page.goto('/');
      await expect(page.getByRole('navigation',{name:'Planning steps'})).toBeVisible();
      const tools=await page.evaluate(()=>(window as unknown as {__planonitTools:Array<{name:string}>}).__planonitTools.map(tool=>tool.name));
      expect(tools).toContain('create_evening_plan');
      expect(tools).toContain('start_new_plan');
      expect(tools).toHaveLength(13);
      await expect(page.getByText('Agent-ready · 13 tools')).toBeVisible();
      await noHorizontalOverflow(page,viewport.width);
      expect(consoleErrors).toEqual([]);
    });

    test('keeps navigation usable, keyboard-addressable and large enough to tap',async({page})=>{
      await installModelContext(page);
      await page.goto('/');
      const navButtons=page.getByRole('navigation',{name:'Planning steps'}).getByRole('button');
      await expect(navButtons).toHaveCount(4);
      for(const target of await tapTargets(page,'nav[aria-label="Planning steps"] button'))
        expect(target.height,`nav "${target.label}" tap target`).toBeGreaterThanOrEqual(44);
      await navButtons.nth(2).click();
      await expect(page.getByText('CURRENT PLAN')).toBeVisible();
      await navButtons.nth(0).focus();
      expect(await page.evaluate(()=>document.activeElement?.textContent?.trim())).toContain('Goal');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading',{name:/Tell an agent what you want/})).toBeVisible();
      await noHorizontalOverflow(page,viewport.width);
    });

    test('surfaces form errors accessibly and keeps them on screen',async({page})=>{
      await installModelContext(page);
      await page.goto('/');
      const budget=page.getByLabel('Budget');
      await budget.fill('-10');
      await budget.blur();
      const error=page.locator('#budget-error');
      await expect(error).toBeVisible();
      await expect(error).toHaveAttribute('role','alert');
      await expect(budget).toHaveAttribute('aria-invalid','true');
      await expect(budget).toHaveAttribute('aria-describedby','budget-error');
      expect(await error.evaluate(node=>node.getBoundingClientRect().right)).toBeLessThanOrEqual(viewport.width);
      expect(await error.evaluate(node=>Number.parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(12);
      await noHorizontalOverflow(page,viewport.width);
    });

    test('runs the full plan, repair, approve, reserve and new-plan workflow',async({page})=>{
      await installModelContext(page);
      await page.goto('/');
      await page.getByRole('button',{name:/Create plan preview/}).click();
      await expect(page.getByText('CURRENT PLAN')).toBeVisible();
      await noHorizontalOverflow(page,viewport.width);

      // plan card content stays readable
      for(const size of await page.locator('.check-grid span, .timeline-row span').evaluateAll(nodes=>nodes.map(node=>Number.parseFloat(getComputedStyle(node).fontSize))))
        expect(size).toBeGreaterThanOrEqual(12);

      // repair workflow
      await page.getByRole('button',{name:'2. Explore'}).click();
      await page.locator('.choice-card').first().locator('.slot-row button').first().click();
      await page.getByRole('button',{name:'3. Plan'}).click();
      const repair=page.getByRole('button',{name:/Repair plan now/});
      if(await repair.count()){
        await expect(repair).toBeVisible();
        await repair.click();
      }
      await noHorizontalOverflow(page,viewport.width);

      // approval is human-only and reachable on a phone
      const approve=page.getByRole('button',{name:/Approve this plan/});
      await expect(approve).toBeEnabled();
      for(const target of await tapTargets(page,'.cost-card button'))
        expect(target.height,`action "${target.label}" tap target`).toBeGreaterThanOrEqual(40);
      await approve.click();
      await expect(page.getByText('Approved · awaiting confirmation').first()).toBeVisible();

      // reservation and the explicit new-plan lifecycle
      await page.getByRole('button',{name:/Confirm sandbox reservation/}).click();
      await expect(page.getByText('Reserved · confirmed').first()).toBeVisible();
      await expect(page.getByText('RESERVATION HISTORY')).toBeVisible();
      const startNew=page.getByRole('button',{name:/Start a new plan/});
      await expect(startNew).toBeVisible();
      await noHorizontalOverflow(page,viewport.width);
      await startNew.click();
      await expect(page.getByRole('heading',{name:/This plan is reserved|Create a feasible first draft/})).toBeVisible();
      await page.getByRole('button',{name:'3. Plan'}).click();
      await expect(page.getByText('RESERVATION HISTORY')).toBeVisible();
      await expect(page.getByText(/Still committed · superseded/)).toBeVisible();
      await noHorizontalOverflow(page,viewport.width);
    });
  });
}
