const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const util = require('util');
const { randomUUID } = require('crypto');
const playSound = require('play-sound')();

const soundTrack = {
  noise: path.join(__dirname, 'noise.mp3'),
  notify: path.join(__dirname, 'notify.mp3'),
};
const cookiesPath = path.join(__dirname, 'cookies.json');
const logPath = path.join(__dirname, 'debug.log');
const initLink = 'https://hvr-amazon.my.site.com/Dashboard?setlang=en_US';
const loginLink = 'https://hiring.amazon.ca/app#/login';
const jobSearch = 'https://hiring.amazon.ca/app#/jobSearch';

const applicationLinks = {
  'Scarborough, ON Canada': 'https://hvr-amazon.my.site.com/ApplicationShiftSelect?appid=a014U00002wfH7SQAU',
  'Barrhaven, ON Canada': 'https://hvr-amazon.my.site.com/ApplicationShiftSelect?appid=a014U00002wfbWWQAY',
  'Whitby, ON Canada': 'https://hvr-amazon.my.site.com/ApplicationShiftSelect?appid=a014U00002ulK9UQAU',
  'Belleville, ON Canada': 'https://hvr-amazon.my.site.com/ApplicationShiftSelect?appid=a014U00002ulCFTQA2',
};
const credentials = {
  email: 'yachipatel29@gmail.com',
  password: '293125',
  siNumber: '154-084-404',
};
const refreshSpeedSecForApplication = 8;
const refreshSpeedSecForJobSearch = 5;

// - ***** - - ***** - - ***** - - ***** - - ***** - //

$log: {
  const logFile = fs.createWriteStream(logPath, { flags: 'a' });
  function formatArgs(args) {
    return args
      .map((arg) => {
        if (typeof arg === 'object') {
          return util.inspect(arg, { showHidden: false, depth: null, colors: false });
        } else {
          return arg;
        }
      })
      .join(' ');
  }
  const originalConsoleLog = console.log;
  function log(...args) {
    const output = formatArgs(args);
    logFile.write(new Date().toISOString() + ': ' + output + '\n');
    originalConsoleLog(...args);
  }
  console.log = log;
  console.error = log;
  console.debug = log;
  console.info = log;
}

/**
 * @param {keyof soundTrack} track
 * @returns {Promise<void>}
 */
async function playSoundTrack(track) {
  await new Promise((res, rej) => {
    playSound.play(soundTrack[track], (err) => {
      if (err) {
        rej(err);
        console.error('Failed to play sound:', err);
      } else {
        res();
      }
    });
  });
  console.log('Sound played successfully!');
}

/**
 * @param {string} question
 * @returns {Promise<string>}
 */
async function questionClient(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await new Promise((resolve) => {
    rl.question(question, resolve);
  });
  rl.close();
  return answer;
}

/**
 * @param {puppeteer.Page} page
 */
async function CookiesLocallyToPage(page) {
  console.log('using cookies from local-disk from previous runs');
  if (!fs.existsSync(cookiesPath)) return;
  const cookies = JSON.parse(fs.readFileSync(cookiesPath).toString());
  await page.setCookie(...cookies);
}

/**
 *
 * @param {puppeteer.Page} page
 */
async function CookiesPageToLocally(page) {
  console.log('storing cookies to local-disk for future runs');
  const cookies = await page.cookies();
  fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, '\t'));
}
/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function waitForTimeout(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @template {Record<string, Promise<any>>} O
 * @param {O} obj
 * @returns {Promise<keyof O>}
 */
function firstResolve(obj) {
  return Promise.race(Object.keys(obj).map((x) => obj[x].then(() => x)));
}

/**
 *
 * @param {puppeteer.Browser} browser
 * @param {keyof applicationLinks} applicationLabel
 * @param {number} delaySec
 * @param {puppeteer.Page | undefined} [page=undefined]
 */
async function runForApplication(browser, applicationLabel, delaySec, page) {
  if (!page) {
    await waitForTimeout(delaySec * 1000);
    console.log(`running application for [${applicationLabel}]`);
    page = await browser.newPage();
    await page.evaluate(() => {
      document.body.style.transform = 'scale(0.75)';
      document.body.style.transformOrigin = 'top left';
    });
  }
  try {
    await page.goto(applicationLinks[applicationLabel]);
    const confirmBtn = await page.waitForSelector('.requisition-row button.requisition-confirm-btn', {
      timeout: refreshSpeedSecForApplication * 1000,
    });
    console.log(`found a confirm btn for [${applicationLabel}] application`);
    await page.evaluate(() => {
      window.scrollBy(0, 1000); // Scroll down by 1000 pixels
    });
    await page.screenshot({ path: `ss/${applicationLabel}.success.png` });
    await confirmBtn.click();
    await playSoundTrack('noise');
    await Promise.race([]);
  } catch {
    try {
      console.log(`failed to succeed for [${applicationLabel}] application`);
      await page.evaluate(() => {
        window.scrollBy(0, 1000); // Scroll down by 1000 pixels
      });
      const warningMsg = await page.$('.warning-message-container');
      const text = await warningMsg?.evaluate((ele) => ele.textContent?.trim());
      console.log('site msg for', applicationLabel, '::', text);
      const notFound = text?.includes('Sorry, we do not have a shift available that matches your preferences');
      if (notFound) {
        // await page.screenshot({ path: `ss/${applicationLabel}.error.png` });
      } else {
        await page.screenshot({ path: `ss/${applicationLabel}.${randomUUID()}.png` });
      }
      return runForApplication(browser, applicationLabel, delaySec, page);
    } catch (err) {
      console.error(err);
      await page.close();
    }
  }
}

/**
 * @param {puppeteer.Browser} browser
 */
async function checkAndLogin(browser) {
  const page = await browser.newPage();
  console.log('reject all permissions!');
  page.on('permissionrequest', (permissionRequest) => {
    console.log('permission request denied. FOR:', permissionRequest.name());
    permissionRequest.deny(); // Deny location requests
  });
  try {
    await CookiesLocallyToPage(page);
    await page.goto(initLink);
    console.log('checking for login');
    const status = await firstResolve({
      needToLogIn: page.waitForSelector('#signinOrCreateAccountBtn'),
      alreadyLoggedIn: page.waitForSelector('#candidate\\ '),
    });
    if (status === 'alreadyLoggedIn') {
      console.log('Cookies login was successful.');
      return;
    }
    console.log('need to login!');
    await page.goto(loginLink, { waitUntil: 'domcontentloaded' });
    await waitForTimeout(5000);
    $consent_btn: {
      console.log('click on consent btn');
      const btn = await page.waitForSelector('button[data-test-id="consentBtn"]', { timeout: 5000 }).catch(() => null);
      if (btn) {
        await btn.click();
        await waitForTimeout(2000);
      }
    }
    $email: {
      console.log('filling email...');
      const input = await page.waitForSelector('input[data-test-id="input-test-id-login"]');
      await input.type(credentials.email, { delay: 100 });
      const btn = await page.waitForSelector('button[data-test-id="button-next"]');
      await btn.click({ delay: 250 });
    }
    $password: {
      console.log('filling password...');
      const input = await page.waitForSelector('input[data-test-id="input-test-id-pin"]');
      await input.type(credentials.password, { delay: 100 });
      const btn = await page.waitForSelector('button[data-test-id="button-next"]');
      await btn.click({ delay: 250 });
    }
    $2fa: {
      console.log('selecting 2fa method...');
      const input = await page.waitForSelector('[data-test-id*="Email verification code to "]');
      await input.click({ delay: 300 });
      const btn = await page.waitForSelector('[data-test-id="button-submit"]');
      await btn.click({ delay: 150 });
    }
    $otp: {
      console.log('filling otp...');
      const input = await page.waitForSelector('[data-test-id="input-test-id-confirmOtp"]');
      const otp = await questionClient('Enter Otp sent to your mail-id: ');
      await input.type(otp, { delay: 750 });
    }
    console.log('waiting for login success');
    await page.waitForSelector('#candidate\\ ');
    await CookiesPageToLocally(page);
    console.log('logged in successfully');
  } finally {
    page.close();
  }
}

/**
 * @param {puppeteer.Browser} browser
 */
async function checkForJobs(browser) {
  const page = await browser.newPage();
  let wasNotFound = true;
  console.log('reject all permissions!');
  page.on('permissionrequest', (permissionRequest) => {
    console.log('permission request denied. FOR:', permissionRequest.name());
    permissionRequest.deny(); // Deny location requests
  });
  do {
    console.log('refresh wait...');
    await waitForTimeout(refreshSpeedSecForJobSearch * 1000);
    await page.goto(jobSearch, { timeout: 60_000 });
    console.log('refresh completed');
    const ele = await page.waitForSelector('h1').catch(() => null);
    console.log('ele resolved');
    const notFound = await ele?.evaluate((x) => x.innerText.includes('Sorry, there are no jobs available that match your search'));
    $consent_btn: {
      console.log('click on consent btn');
      const btn = await page.$('button[data-test-id="consentBtn"]');
      if (btn) {
        await btn.click();
        await waitForTimeout(2000);
      }
    }
    $skip: {
      const btn = await page.$('div[role="button"]:has(svg[data-test-component="StencilIconCross"])');
      if (btn) {
        await btn.click();
        await waitForTimeout(2000);
      }
    }
    // $update_filter: {
    //   const btn_s = await page.$$('.scrollableHorizontal button');
    //   const btn = await Promise.all(
    //     btn_s.map((btn) =>
    //       btn
    //         .evaluate((x) => x.innerText.includes('Within')) //
    //         .then((x) => (x ? btn : null)),
    //     ),
    //   )
    //     //
    //     .then((x) => x.find((btn) => btn));
    //   if (btn) {
    //     btn.click({ delay: 500 });
    //   }
    //   await Promise.race([]); // TODO
    // }
    if (notFound) {
      // await page.screenshot({ path: 'ss/_JOB-SEARCH.error.png' });
    } else if (wasNotFound) {
      await page.screenshot({ path: `ss/_JOB-SEARCH.${randomUUID()}.png` });
      await playSoundTrack('noise');
    }
    wasNotFound = notFound;
  } while (true);
}

async function main() {
  await playSoundTrack('notify');
  console.log('Started!');
  const headless = await questionClient('Need to show chrome? (Yes/No): ');
  const browser = await puppeteer.launch({
    defaultViewport: null, // This ensures the viewport matches the window size
    args: ['--window-size=1500,900'], // Sets the window size
    headless: headless.toLowerCase() === 'y' || headless.toLowerCase() === 'yes' ? false : true,
  });
  try {
    await checkAndLogin(browser);
    await checkForJobs(browser);
    await Promise.race(
      Object.keys(applicationLinks).map((label, i, arr) => {
        return runForApplication(browser, label, (refreshSpeedSecForApplication * i) / arr.length);
      }),
    );
    console.log('Completed Safely');
  } catch (err) {
    console.log(err);
  } finally {
    console.log('Closing browser...');
    await browser.close();
  }
}

main();
