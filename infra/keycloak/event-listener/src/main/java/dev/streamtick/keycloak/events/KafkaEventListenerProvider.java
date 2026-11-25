package dev.streamtick.keycloak.events;

import java.util.Optional;
import org.jboss.logging.Logger;
import org.keycloak.events.Event;
import org.keycloak.events.EventListenerProvider;
import org.keycloak.events.admin.AdminEvent;
import org.keycloak.models.AbstractKeycloakTransaction;
import org.keycloak.models.KeycloakSession;

/**
 * Per-request listener. A deletion is published only after Keycloak's transaction has committed,
 * so a deletion that fails and rolls back is never announced. Nothing thrown here may reach
 * Keycloak: it runs inside the user's deletion request.
 */
final class KafkaEventListenerProvider implements EventListenerProvider {

  private static final Logger LOG = Logger.getLogger(KafkaEventListenerProvider.class);

  private final KeycloakSession session;
  private final IdentityEventPublisher publisher;

  KafkaEventListenerProvider(KeycloakSession session, IdentityEventPublisher publisher) {
    this.session = session;
    this.publisher = publisher;
  }

  @Override
  public void onEvent(Event event) {
    try {
      publishAfterCommit(UserDeleted.fromUserEvent(event));
    } catch (RuntimeException e) {
      LOG.error("stock-kafka listener failed on a user event", e);
    }
  }

  @Override
  public void onEvent(AdminEvent event, boolean includeRepresentation) {
    try {
      publishAfterCommit(UserDeleted.fromAdminEvent(event));
    } catch (RuntimeException e) {
      LOG.error("stock-kafka listener failed on an admin event", e);
    }
  }

  private void publishAfterCommit(Optional<UserDeleted> deleted) {
    if (deleted.isEmpty()) return;
    UserDeleted event = deleted.get();
    session.getTransactionManager().enlistAfterCompletion(new AbstractKeycloakTransaction() {
      @Override
      protected void commitImpl() {
        publisher.publish(event);
      }

      @Override
      protected void rollbackImpl() {
        // The user was not deleted after all.
      }
    });
  }

  @Override
  public void close() {
  }
}
