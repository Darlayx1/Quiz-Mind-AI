import type { Plugin } from 'esbuild';

/** Domain hook simulators do not mount DOM nodes. Browser QA exercises real motion. */
export const presentationTestHost: Plugin = {
  name: 'presentation-test-host',
  setup(build) {
    build.onResolve({ filter: /(?:^motion\/react$|\/ui\/motion\.js$|\/MotionPrimitives\.js$)/ }, args => ({ path: args.path, namespace: 'presentation-host' }));
    build.onLoad({ filter: /.*/, namespace: 'presentation-host' }, ({ path }) => ({ contents:
      path === 'motion/react'
        ? 'export const m={div:"div",li:"li"};export const AnimatePresence="AnimatePresence";'
        : path.endsWith('MotionPrimitives.js')
          ? 'export const AmbientVisual="AmbientVisual",MotionToggle="MotionToggle";'
          : 'export const useVisualTransition=()=>{},useListReflow=()=>{},useSelectionIndicator=()=>{},useAnimatedDismiss=(_ref,close)=>close,useMotionPreferences=()=>({reduced:true,paused:false,hidden:false});export const motionTiming={exit:200};',
    }));
  },
};
