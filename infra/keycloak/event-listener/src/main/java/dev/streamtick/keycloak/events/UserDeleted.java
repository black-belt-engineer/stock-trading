package dev.streamtick.keycloak.events;

import java.util.Optional;
import java.util.regex.Pattern;
import org.keycloak.events.Event;
import org.keycloak.events.EventType;
import org.keycloak.events.admin.AdminEvent;
import org.keycloak.events.admin.OperationType;
import org.keycloak.events.admin.ResourceType;

/**
 * The one message the listener publishes: {@code {"type":"user.deleted","userId":…,"occurredAt":…,"source":…}}.
 * Only the user id leaves Keycloak: no email, no name.
 */
public record UserDeleted(String userId, long occurredAt, String source) {

  // Keycloak user ids are UUIDs. Anything else is not published (and could not break the JSON).
  private static final Pattern USER_ID = Pattern.compile("^[0-9a-fA-F-]{36}$");
  private static final Pattern USER_PATH = Pattern.compile("^users/([0-9a-fA-F-]{36})$");

  /** The user deleted their own account (the Settings page's {@code delete_account} action). */
  public static Optional<UserDeleted> fromUserEvent(Event event) {
    if (event == null || event.getType() != EventType.DELETE_ACCOUNT) return Optional.empty();
    String userId = event.getUserId();
    if (userId == null || !USER_ID.matcher(userId).matches()) return Optional.empty();
    return Optional.of(new UserDeleted(userId, event.getTime(), "self"));
  }

  /** An admin deleted the user (admin console or Admin REST API): {@code DELETE} on {@code users/<id>}. */
  public static Optional<UserDeleted> fromAdminEvent(AdminEvent event) {
    if (event == null || event.getOperationType() != OperationType.DELETE || event.getResourceType() != ResourceType.USER) {
      return Optional.empty();
    }
    String path = event.getResourcePath();
    if (path == null) return Optional.empty();
    var match = USER_PATH.matcher(path);
    if (!match.matches()) return Optional.empty();
    return Optional.of(new UserDeleted(match.group(1), event.getTime(), "admin"));
  }

  /** The message value. Every field is a UUID, a number or a fixed word, so nothing needs escaping. */
  public String toJson() {
    return "{\"type\":\"user.deleted\",\"userId\":\"" + userId + "\",\"occurredAt\":" + occurredAt
        + ",\"source\":\"" + source + "\"}";
  }
}
