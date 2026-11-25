package dev.streamtick.keycloak.events;

import java.util.Properties;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.Producer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.StringSerializer;
import org.jboss.logging.Logger;

/**
 * Sends {@link UserDeleted} messages to Kafka, keyed by the user id, without ever blocking or
 * failing the Keycloak request that caused them.
 *
 * <p>{@code send()} can block while it waits for broker metadata, so every send runs on one
 * background thread. The producer retries for a few seconds; a message that still fails is logged
 * at ERROR with the user id, and the portfolio service's nightly cleanup removes the rows instead.
 * One instance per Keycloak node, created by the factory; {@link KafkaProducer} is thread-safe.
 */
public final class IdentityEventPublisher implements AutoCloseable {

  private static final Logger LOG = Logger.getLogger(IdentityEventPublisher.class);

  private final String topic;
  private final Producer<String, String> producer;
  private final ExecutorService sender;

  IdentityEventPublisher(String topic, Producer<String, String> producer) {
    this.topic = topic;
    this.producer = producer;
    this.sender = Executors.newSingleThreadExecutor(runnable -> {
      Thread thread = new Thread(runnable, "stock-kafka-listener");
      thread.setDaemon(true);
      return thread;
    });
  }

  /** A producer with short timeouts: a few retries within about 10 s, never longer. */
  public static IdentityEventPublisher connect(String bootstrapServers, String topic) {
    Properties config = new Properties();
    config.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
    config.put(ProducerConfig.CLIENT_ID_CONFIG, "keycloak-stock-kafka");
    config.put(ProducerConfig.ACKS_CONFIG, "all");
    config.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, "true");
    config.put(ProducerConfig.MAX_BLOCK_MS_CONFIG, "5000");
    config.put(ProducerConfig.REQUEST_TIMEOUT_MS_CONFIG, "3000");
    config.put(ProducerConfig.DELIVERY_TIMEOUT_MS_CONFIG, "10000");
    config.put(ProducerConfig.RETRY_BACKOFF_MS_CONFIG, "500");
    config.put(ProducerConfig.LINGER_MS_CONFIG, "0");
    // Serializer instances, not class names: Kafka would look the names up through the thread's
    // class loader, which inside Keycloak is not this provider's.
    ClassLoader previous = Thread.currentThread().getContextClassLoader();
    Thread.currentThread().setContextClassLoader(IdentityEventPublisher.class.getClassLoader());
    try {
      return new IdentityEventPublisher(topic, new KafkaProducer<>(config, new StringSerializer(), new StringSerializer()));
    } finally {
      Thread.currentThread().setContextClassLoader(previous);
    }
  }

  /** Queues the message and returns at once. Never throws. */
  public void publish(UserDeleted event) {
    try {
      sender.execute(() -> send(event));
    } catch (RejectedExecutionException e) {
      LOG.errorf("Not published (listener shutting down): user.deleted for user %s", event.userId());
    }
  }

  private void send(UserDeleted event) {
    try {
      producer.send(new ProducerRecord<>(topic, event.userId(), event.toJson()), (metadata, error) -> {
        if (error != null) {
          LOG.errorf(error, "Could not publish user.deleted for user %s to %s; the nightly cleanup will remove the data", event.userId(), topic);
        } else {
          LOG.infof("Published user.deleted for user %s (%s) to %s", event.userId(), event.source(), topic);
        }
      });
    } catch (RuntimeException e) {
      LOG.errorf(e, "Could not publish user.deleted for user %s to %s; the nightly cleanup will remove the data", event.userId(), topic);
    }
  }

  @Override
  public void close() {
    sender.shutdown();
    try {
      sender.awaitTermination(5, TimeUnit.SECONDS);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
    producer.close(java.time.Duration.ofSeconds(5));
  }
}
