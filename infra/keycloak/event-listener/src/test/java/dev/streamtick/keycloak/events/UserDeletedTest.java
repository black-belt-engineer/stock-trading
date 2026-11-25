package dev.streamtick.keycloak.events;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.keycloak.events.Event;
import org.keycloak.events.EventType;
import org.keycloak.events.admin.AdminEvent;
import org.keycloak.events.admin.OperationType;
import org.keycloak.events.admin.ResourceType;

class UserDeletedTest {

  private static final String ID = "876fa7db-9db6-4027-b24e-dc5d4d9e5600";

  @Test
  void selfDeletionBecomesAMessage() {
    Event event = new Event();
    event.setType(EventType.DELETE_ACCOUNT);
    event.setUserId(ID);
    event.setTime(1700000000000L);
    UserDeleted deleted = UserDeleted.fromUserEvent(event).orElseThrow();
    assertEquals(
        "{\"type\":\"user.deleted\",\"userId\":\"" + ID + "\",\"occurredAt\":1700000000000,\"source\":\"self\"}",
        deleted.toJson());
  }

  @Test
  void otherUserEventsAreIgnored() {
    Event event = new Event();
    event.setType(EventType.LOGIN);
    event.setUserId(ID);
    assertTrue(UserDeleted.fromUserEvent(event).isEmpty());
    Event noUser = new Event();
    noUser.setType(EventType.DELETE_ACCOUNT);
    assertTrue(UserDeleted.fromUserEvent(noUser).isEmpty());
  }

  @Test
  void adminDeleteOfAUserBecomesAMessage() {
    AdminEvent event = new AdminEvent();
    event.setOperationType(OperationType.DELETE);
    event.setResourceType(ResourceType.USER);
    event.setResourcePath("users/" + ID);
    event.setTime(5L);
    UserDeleted deleted = UserDeleted.fromAdminEvent(event).orElseThrow();
    assertEquals(ID, deleted.userId());
    assertEquals("admin", deleted.source());
  }

  @Test
  void otherAdminEventsAreIgnored() {
    AdminEvent update = new AdminEvent();
    update.setOperationType(OperationType.UPDATE);
    update.setResourceType(ResourceType.USER);
    update.setResourcePath("users/" + ID);
    assertTrue(UserDeleted.fromAdminEvent(update).isEmpty());

    AdminEvent client = new AdminEvent();
    client.setOperationType(OperationType.DELETE);
    client.setResourceType(ResourceType.CLIENT);
    client.setResourcePath("clients/" + ID);
    assertTrue(UserDeleted.fromAdminEvent(client).isEmpty());

    AdminEvent session = new AdminEvent();
    session.setOperationType(OperationType.DELETE);
    session.setResourceType(ResourceType.USER);
    session.setResourcePath("users/" + ID + "/consents/x");
    assertTrue(UserDeleted.fromAdminEvent(session).isEmpty());
  }
}
