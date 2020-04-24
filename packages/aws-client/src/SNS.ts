import pRetry from 'p-retry';
import Logger = require('@cumulus/logger');
import { sns } from './services';

const log = new Logger({ sender: 'aws-client/sns' });

/**
 * Publish a message to an SNS topic. Does not catch
 * errors, to allow more specific handling by the caller.
 *
 * @param snsTopicArn - SNS topic ARN
 * @param message - Message object
 * @param retryOptions - options to control retry behavior when publishing
 * a message fails. See https://github.com/tim-kos/node-retry#retryoperationoptions
 */
export const publishSnsMessage = async (
  snsTopicArn: string,
  message: any,
  retryOptions = {}
) =>
  pRetry(
    async () => {
      if (!snsTopicArn) {
        throw new pRetry.AbortError('Missing SNS topic ARN');
      }

      await sns().publish({
        TopicArn: snsTopicArn,
        Message: JSON.stringify(message)
      }).promise();
    },
    {
      maxTimeout: 5000,
      onFailedAttempt: (err) => log.debug(`publishSnsMessage('${snsTopicArn}', '${message}') failed with ${err.retriesLeft} retries left: ${err.message}`),
      ...retryOptions
    }
  );