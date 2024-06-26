'use strict';

const { lambda, s3 } = require('@cumulus/aws-client/services');
const { randomString } = require('@cumulus/common/test-utils');
const {
  deleteS3Object,
  listS3ObjectsV2,
  getObject,
  getObjectStreamContents,
} = require('@cumulus/aws-client/S3');
const { waitForListObjectsV2ResultCount } = require('@cumulus/integration-tests');

const { loadConfig } = require('../../helpers/testUtils');
describe('when a bad record is ingested', () => {
  let stackName;
  let systemBucket;
  let executionArn;
  let failedMessageS3Key;

  beforeAll(async () => {
    const config = await loadConfig();
    stackName = config.stackName;
    systemBucket = config.bucket;
  });
  afterAll(async () => {
    await deleteS3Object(
      systemBucket,
      failedMessageS3Key
    );
  });
  it('is sent to the DLA and processed to have expected metadata fields', async () => {
    executionArn = `execution-${randomString(16)}`;
    const { $metadata } = await lambda().invoke({
      FunctionName: `${stackName}-sfEventSqsToDbRecords`,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({
        env: {},
        Records: [{
          Body: JSON.stringify({
            time: '4Oclock',
            detail: {
              executionArn: executionArn,
              stateMachineArn: '1234',
              status: 'RUNNING',
              input: JSON.stringify({
                meta: {
                  collection: {
                    name: 'A_COLLECTION',
                    version: '12',
                  },
                  provider: {
                    id: 'abcd',
                    protocol: 'a',
                    host: 'b',
                  },
                },
                payload: {
                  granules: [{ granuleId: 'a' }],
                },
              }),
            },
          }),
        }],
      }),
    });
    if ($metadata.httpStatusCode >= 400) {
      fail(`lambda invocation to set up failed, code ${$metadata.httpStatusCode}`);
    }
    console.log(`Waiting for the creation of failed message for execution ${executionArn}`);
    const prefix = `${stackName}/dead-letter-archive/sqs/${executionArn}`;

    try {
      await expectAsync(waitForListObjectsV2ResultCount({
        bucket: systemBucket,
        prefix,
        desiredCount: 1,
        interval: 5 * 1000,
        timeout: 30 * 1000,
      })).toBeResolved();
      // fetch key for cleanup
      const listResults = await listS3ObjectsV2({
        Bucket: systemBucket,
        Prefix: prefix,
      });
      failedMessageS3Key = listResults[0].Key;
    } catch (error) {
      fail(`Did not find expected S3 Object: ${error}`);
    }
    const s3Object = await getObject(
      s3(),
      {
        Bucket: systemBucket,
        Key: failedMessageS3Key,
      }
    );
    const fileBody = await getObjectStreamContents(s3Object.Body);

    const parsed = JSON.parse(fileBody);
    expect(parsed.status).toEqual('RUNNING');
    expect(parsed.time).toEqual('4Oclock');
    expect(parsed.stateMachineArn).toEqual('1234');
    expect(parsed.collectionId).toEqual('A_COLLECTION___12');
    expect(parsed.executionArn).toEqual(executionArn);
    expect(parsed.granules).toEqual(['a']);
    expect(parsed.providerId).toEqual('abcd');
    expect(parsed.error).toEqual('UnmetRequirementsError: Could not satisfy requirements for writing records to PostgreSQL. No records written to the database.');
  });

  it('is sent to the DLA and processed to have expected metadata fields even when data is not found', async () => {
    executionArn = `execution-${randomString(16)}`;
    const { $metadata } = await lambda().invoke({
      FunctionName: `${stackName}-sfEventSqsToDbRecords`,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({
        env: {},
        Records: [{
          Body: JSON.stringify({
            detail: {
              executionArn: executionArn,
              input: JSON.stringify({
                a: 'sldkj',
              }),
            },
          }),
        }],
      }),
    });
    if ($metadata.httpStatusCode >= 400) {
      fail(`lambda invocation to set up failed, code ${$metadata.httpStatusCode}`);
    }
    console.log(`Waiting for the creation of failed message for execution ${executionArn}`);
    const prefix = `${stackName}/dead-letter-archive/sqs/${executionArn}`;

    try {
      await expectAsync(waitForListObjectsV2ResultCount({
        bucket: systemBucket,
        prefix,
        desiredCount: 1,
        interval: 5 * 1000,
        timeout: 30 * 1000,
      })).toBeResolved();
      // fetch key for cleanup
      const listResults = await listS3ObjectsV2({
        Bucket: systemBucket,
        Prefix: prefix,
      });
      failedMessageS3Key = listResults[0].Key;
    } catch (error) {
      fail(`Did not find expected S3 Object: ${error}`);
    }
    const s3Object = await getObject(
      s3(),
      {
        Bucket: systemBucket,
        Key: failedMessageS3Key,
      }
    );
    const fileBody = await getObjectStreamContents(s3Object.Body);

    const parsed = JSON.parse(fileBody);

    expect(parsed.status).toEqual(null);
    expect(parsed.time).toEqual(null);
    expect(parsed.stateMachineArn).toEqual(null);
    expect(parsed.collectionId).toEqual(null);
    expect(parsed.executionArn).toEqual(executionArn);
    expect(parsed.granules).toEqual(null);
    expect(parsed.providerId).toEqual(null);
    expect(parsed.error).toEqual('CumulusMessageError: getMessageWorkflowStartTime on a message without a workflow_start_time');
  });
});
