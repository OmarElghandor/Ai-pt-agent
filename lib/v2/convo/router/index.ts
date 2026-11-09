export { isGreetingOrSmallTalk } from './greetings';
export {
  extractExplicitTopicRequest,
  isExplicitTopicRequest,
} from './patterns';
export { routeTopic, stubRouterClassifier } from './routeTopic';
export { applyRouterLock } from './applyLock';
export type {
  RouterClassifyInput,
  RouterClassifier,
  RouterDecision,
  RouterModelOutput,
} from './types';
export { ROUTER_CONFIDENCE_FLOOR } from './types';
