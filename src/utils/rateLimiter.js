import Bottleneck from 'bottleneck';

const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 200
});

export const rateLimitedFunction = limiter.wrap(async (args) => {
  // Your function logic here
});

export default limiter; 