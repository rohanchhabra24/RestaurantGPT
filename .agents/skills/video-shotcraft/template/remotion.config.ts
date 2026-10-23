import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer('angle');
Config.setConcurrency(4);
// This sandbox has no outbound access to remotion.media (where Remotion
// would normally download its own headless Chrome), but a pre-installed
// headless shell already exists at this path (used elsewhere in this
// session via Playwright) — point Remotion at it directly instead.
Config.setBrowserExecutable('/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell');
