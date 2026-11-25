package dev.streamtick.keycloak.events;

import org.jboss.logging.Logger;
import org.keycloak.Config;
import org.keycloak.events.EventListenerProvider;
import org.keycloak.events.EventListenerProviderFactory;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;

/**
 * Factory of the {@code stock-kafka} event listener (K6). Configured through Keycloak's SPI
 * options, set in docker-compose:
 * <pre>
 *   --spi-events-listener--stock-kafka--bootstrap-servers=kafka:29092
 *   --spi-events-listener--stock-kafka--topic=identity.events
 * </pre>
 * The realm turns it on by listing {@code stock-kafka} in {@code eventsListeners}.
 */
public final class KafkaEventListenerProviderFactory implements EventListenerProviderFactory {

  public static final String ID = "stock-kafka";
  private static final Logger LOG = Logger.getLogger(KafkaEventListenerProviderFactory.class);

  private String bootstrapServers;
  private String topic;
  private volatile IdentityEventPublisher publisher;

  @Override
  public void init(Config.Scope config) {
    bootstrapServers = config.get("bootstrapServers", "kafka:29092");
    topic = config.get("topic", "identity.events");
    LOG.infof("stock-kafka listener: user deletions go to %s on %s", topic, bootstrapServers);
  }

  @Override
  public void postInit(KeycloakSessionFactory factory) {
  }

  @Override
  public EventListenerProvider create(KeycloakSession session) {
    return new KafkaEventListenerProvider(session, publisher());
  }

  /** Created on first use, so a broker that is down at start-up never stops Keycloak starting. */
  private IdentityEventPublisher publisher() {
    IdentityEventPublisher current = publisher;
    if (current != null) return current;
    synchronized (this) {
      if (publisher == null) publisher = IdentityEventPublisher.connect(bootstrapServers, topic);
      return publisher;
    }
  }

  @Override
  public void close() {
    IdentityEventPublisher current = publisher;
    if (current != null) current.close();
  }

  @Override
  public String getId() {
    return ID;
  }
}
