/*
 * BeBoss QNX Neutrino edge-agent reference service.
 * A small native service for verifying QNX SDP 8.0 and demonstrating IPC.
 */
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include <sys/dispatch.h>
#include <sys/neutrino.h>

#define BEBOSS_QNX_SERVICE_NAME "beboss-edge-gateway"
#define BEBOSS_EDGE_PROTOCOL_VERSION 1u
#define BEBOSS_EDGE_PAYLOAD_BYTES 240u

enum {
    BEBOSS_EDGE_OP_HEALTH = 1u,
    BEBOSS_EDGE_OP_ECHO = 2u
};

typedef struct {
    uint16_t version;
    uint16_t opcode;
    uint32_t sequence;
    char payload[BEBOSS_EDGE_PAYLOAD_BYTES];
} beboss_edge_request_t;

typedef struct {
    uint16_t version;
    uint16_t status;
    uint32_t sequence;
    char payload[BEBOSS_EDGE_PAYLOAD_BYTES];
} beboss_edge_reply_t;

static void make_reply(const beboss_edge_request_t *request,
                       beboss_edge_reply_t *reply)
{
    memset(reply, 0, sizeof(*reply));
    reply->version = BEBOSS_EDGE_PROTOCOL_VERSION;
    reply->sequence = request->sequence;

    if (request->version != BEBOSS_EDGE_PROTOCOL_VERSION) {
        reply->status = EPROTO;
        (void)snprintf(reply->payload, sizeof(reply->payload),
                       "Unsupported BeBoss edge protocol version");
        return;
    }

    switch (request->opcode) {
    case BEBOSS_EDGE_OP_HEALTH:
        reply->status = EOK;
        (void)snprintf(reply->payload, sizeof(reply->payload),
                       "{\"service\":\"beboss-edge-gateway\",\"status\":\"ready\",\"os\":\"QNX Neutrino\"}");
        break;

    case BEBOSS_EDGE_OP_ECHO:
        if (memchr(request->payload, '\0', sizeof(request->payload)) == NULL) {
            reply->status = EINVAL;
            (void)snprintf(reply->payload, sizeof(reply->payload),
                           "Payload must be NUL-terminated");
            break;
        }
        reply->status = EOK;
        (void)snprintf(reply->payload, sizeof(reply->payload), "%s",
                       request->payload);
        break;

    default:
        reply->status = ENOSYS;
        (void)snprintf(reply->payload, sizeof(reply->payload),
                       "Unsupported BeBoss edge operation");
        break;
    }
}

int main(void)
{
    name_attach_t *attachment =
        name_attach(NULL, BEBOSS_QNX_SERVICE_NAME, 0);

    if (attachment == NULL) {
        perror("BeBoss QNX edge agent: name_attach");
        return EXIT_FAILURE;
    }

    (void)printf("READY service=%s chid=%d pid=%ld\n",
                 BEBOSS_QNX_SERVICE_NAME,
                 attachment->chid,
                 (long)getpid());
    (void)fflush(stdout);

    for (;;) {
        beboss_edge_request_t request;
        beboss_edge_reply_t reply;
        int receive_id;

        memset(&request, 0, sizeof(request));
        receive_id = MsgReceive(attachment->chid, &request,
                                sizeof(request), NULL);

        if (receive_id == -1) {
            if (errno == EINTR) {
                continue;
            }
            perror("BeBoss QNX edge agent: MsgReceive");
            break;
        }

        /* QNX pulses have receive ID 0 and are not application requests. */
        if (receive_id == 0) {
            continue;
        }

        make_reply(&request, &reply);

        if (MsgReply(receive_id, EOK, &reply, sizeof(reply)) == -1) {
            perror("BeBoss QNX edge agent: MsgReply");
        }
    }

    (void)name_detach(attachment, 0);
    return EXIT_FAILURE;
}
