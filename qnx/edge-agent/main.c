/*
 * BeBoss QNX Neutrino edge-agent reference service.
 * Native IPC endpoint used to verify an SDP 8.0 cross-build and QEMU target.
 */
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include <sys/iofunc.h>
#include <sys/iomsg.h>
#include <sys/dispatch.h>
#include <sys/neutrino.h>

#define BEBOSS_QNX_SERVICE_NAME "beboss-edge-gateway"
#define BEBOSS_EDGE_PROTOCOL_VERSION 1u
#define BEBOSS_EDGE_PAYLOAD_BYTES 240u
#define BEBOSS_EDGE_MSG_TYPE (_IO_MAX + 0x31)

enum {
    BEBOSS_EDGE_OP_HEALTH = 1u,
    BEBOSS_EDGE_OP_ECHO = 2u
};

typedef struct {
    uint16_t type;
    uint16_t version;
    uint16_t opcode;
    uint16_t reserved;
    uint32_t sequence;
    char payload[BEBOSS_EDGE_PAYLOAD_BYTES];
} beboss_edge_request_t;

typedef struct {
    uint16_t version;
    uint16_t status;
    uint32_t sequence;
    char payload[BEBOSS_EDGE_PAYLOAD_BYTES];
} beboss_edge_reply_t;

typedef union {
    struct _pulse pulse;
    beboss_edge_request_t request;
} beboss_edge_received_t;

static void make_reply(const beboss_edge_request_t *request,
                       beboss_edge_reply_t *reply)
{
    memset(reply, 0, sizeof(*reply));
    reply->version = BEBOSS_EDGE_PROTOCOL_VERSION;
    reply->sequence = request->sequence;

    if (request->type != BEBOSS_EDGE_MSG_TYPE) {
        reply->status = EPROTO;
        (void)snprintf(reply->payload, sizeof(reply->payload),
                       "Unsupported message type");
        return;
    }

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
        beboss_edge_received_t received;
        beboss_edge_reply_t reply;
        int receive_id;

        memset(&received, 0, sizeof(received));
        receive_id = MsgReceive(attachment->chid, &received,
                                sizeof(received), NULL);

        if (receive_id == -1) {
            if (errno == EINTR) {
                continue;
            }
            perror("BeBoss QNX edge agent: MsgReceive");
            break;
        }

        if (receive_id == 0) {
            if (received.pulse.code == _PULSE_CODE_DISCONNECT) {
                (void)ConnectDetach(received.pulse.scoid);
            }
            continue;
        }

        /*
         * name_open() first sends an ordinary QNX connection message. Answer
         * it using the connection protocol before accepting app-level IPC.
         */
        if (received.request.type == _IO_CONNECT) {
            if (MsgReply(receive_id, EOK, NULL, 0) == -1) {
                perror("BeBoss QNX edge agent: connection reply");
            }
            continue;
        }

        /* Never interpret reserved QNX I/O messages as BeBoss application data. */
        if (received.request.type <= _IO_MAX) {
            if (MsgError(receive_id, ENOSYS) == -1) {
                perror("BeBoss QNX edge agent: unsupported system message");
            }
            continue;
        }

        make_reply(&received.request, &reply);

        if (MsgReply(receive_id, EOK, &reply, sizeof(reply)) == -1) {
            perror("BeBoss QNX edge agent: MsgReply");
        }
    }

    (void)name_detach(attachment, 0);
    return EXIT_FAILURE;
}
