import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { PublisherGithub } from '@electron-forge/publisher-github';
import { copyRuntimeModules } from './build/runtimeModules';
import path from 'node:path';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true, icon: path.resolve('assets/kite.ico'), executableName: 'Kite',
    ...(process.env.WINDOWS_CERTIFICATE_FILE ? { windowsSign: { certificateFile: process.env.WINDOWS_CERTIFICATE_FILE, certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD } } : {}),
  },
  rebuildConfig: { force: true },
  hooks: { packageAfterCopy: async (_config, buildPath, version, _platform, arch) => {
    await copyRuntimeModules(buildPath);
    console.log(`[native] Forge rebuild target: Electron ${version}, ${arch}; force rebuild enabled`);
  } },
  publishers: [new PublisherGithub({ repository: { owner: 'Dheeraj-Manwani', name: 'kite' }, draft: true, generateReleaseNotes: true })],
  makers: [
    new MakerSquirrel({ name: 'kite', authors: 'Dheeraj Manwani', exe: 'Kite.exe', setupExe: 'KiteSetup.exe', setupIcon: path.resolve('assets/kite.ico'), loadingGif: path.resolve('assets/installer.gif'),
      ...(process.env.WINDOWS_CERTIFICATE_FILE ? { certificateFile: process.env.WINDOWS_CERTIFICATE_FILE, certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD } : {}),
    }),
    new MakerZIP({}, ['win32']),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
