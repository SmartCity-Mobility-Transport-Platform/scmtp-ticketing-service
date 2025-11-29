import { Kafka, Producer, Consumer, EachMessagePayload, logLevel } from 'kafkajs';
import { config } from '../../config';
import logger from '../../utils/logger';
import { DomainEvent, KAFKA_TOPICS } from '../../events/types';

// Kafka client instance
const kafka = new Kafka({
  clientId: config.kafka.clientId,
  brokers: config.kafka.brokers,
  logLevel: logLevel.WARN,
  retry: {
    initialRetryTime: 100,
    retries: 8,
  },
});

let producer: Producer | null = null;
let consumer: Consumer | null = null;

// Producer
export const getProducer = async (): Promise<Producer> => {
  if (producer) {
    return producer;
  }

  producer = kafka.producer({
    allowAutoTopicCreation: true,
    transactionTimeout: 30000,
  });

  await producer.connect();
  logger.info('Kafka producer connected');

  return producer;
};

// Publish event to Kafka
export const publishEvent = async (
  topic: string,
  event: DomainEvent
): Promise<void> => {
  try {
    const prod = await getProducer();
    
    await prod.send({
      topic,
      messages: [
        {
          key: event.aggregateId,
          value: JSON.stringify(event),
          headers: {
            eventType: event.eventType,
            correlationId: event.correlationId || '',
            timestamp: event.timestamp.toISOString(),
          },
        },
      ],
    });

    logger.info('Event published', {
      topic,
      eventType: event.eventType,
      aggregateId: event.aggregateId,
    });
  } catch (error) {
    logger.error('Failed to publish event', { topic, event, error });
    throw error;
  }
};

// Publish multiple events
export const publishEvents = async (
  topic: string,
  events: DomainEvent[]
): Promise<void> => {
  try {
    const prod = await getProducer();

    await prod.send({
      topic,
      messages: events.map((event) => ({
        key: event.aggregateId,
        value: JSON.stringify(event),
        headers: {
          eventType: event.eventType,
          correlationId: event.correlationId || '',
          timestamp: event.timestamp.toISOString(),
        },
      })),
    });

    logger.info('Events published', {
      topic,
      count: events.length,
    });
  } catch (error) {
    logger.error('Failed to publish events', { topic, error });
    throw error;
  }
};

// Consumer
export type MessageHandler = (payload: EachMessagePayload) => Promise<void>;

export const createConsumer = async (
  groupId: string,
  topics: string[],
  handler: MessageHandler
): Promise<Consumer> => {
  consumer = kafka.consumer({ groupId });

  await consumer.connect();
  logger.info('Kafka consumer connected', { groupId });

  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: false });
    logger.info('Subscribed to topic', { topic });
  }

  await consumer.run({
    eachMessage: async (payload) => {
      try {
        await handler(payload);
      } catch (error) {
        logger.error('Error processing message', {
          topic: payload.topic,
          partition: payload.partition,
          offset: payload.message.offset,
          error,
        });
        // Don't throw - let Kafka know message was processed to avoid infinite loop
        // In production, you might want to send to a dead letter queue
      }
    },
  });

  return consumer;
};

// Graceful shutdown
export const disconnectKafka = async (): Promise<void> => {
  try {
    if (producer) {
      await producer.disconnect();
      logger.info('Kafka producer disconnected');
    }

    if (consumer) {
      await consumer.disconnect();
      logger.info('Kafka consumer disconnected');
    }
  } catch (error) {
    logger.error('Error disconnecting from Kafka', error);
  }
};

// Admin operations (for topic management)
export const createTopics = async (topics: string[]): Promise<void> => {
  const admin = kafka.admin();
  
  try {
    await admin.connect();
    
    const existingTopics = await admin.listTopics();
    const topicsToCreate = topics.filter((t) => !existingTopics.includes(t));

    if (topicsToCreate.length > 0) {
      await admin.createTopics({
        topics: topicsToCreate.map((topic) => ({
          topic,
          numPartitions: 3,
          replicationFactor: 1,
        })),
      });
      logger.info('Topics created', { topics: topicsToCreate });
    }
  } finally {
    await admin.disconnect();
  }
};

export { kafka, KAFKA_TOPICS };

