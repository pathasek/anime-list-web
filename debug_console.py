import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        # Start headless chromium
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        console_msgs = []
        page.on("console", lambda msg: console_msgs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: console_msgs.append(f"[ERROR] {err.message}\nStack:\n{err.stack}"))

        print("Visiting site...")
        await page.goto("http://localhost:5173/#/ratings")
        
        # Wait for some time to load
        await asyncio.sleep(2)
        
        # Check if we can find and click the "📚 Série" tab or selector if in split view
        try:
            print("Trying to click series button...")
            # Let's see if choice pane for series is there
            series_choice = page.locator(".choice-series")
            if await series_choice.count() > 0:
                await series_choice.click()
                print("Clicked series choice card.")
                await asyncio.sleep(2)
            else:
                # Try header nav action
                btn_series = page.locator("button.btn-nav:has-text('📚 Série')")
                if await btn_series.count() > 0:
                    await btn_series.click()
                    print("Clicked header series nav button.")
                    await asyncio.sleep(2)
        except Exception as e:
            print("Navigation click exception:", e)

        print("\n=== CONSOLE LOGS ===")
        for msg in console_msgs:
            print(msg)
        print("====================\n")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
