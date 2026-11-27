/*
 * BeBoss QNX Neutrino edge-agent IPC smoke-test client.
 * Run this on the same QNX target after starting beboss-qnx-edge-agent.
 */
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

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

static int send_request(int connection, uint16_t opcode, uint32_t sequence,
                        const char *payload)
{
    beboss_edge_request_t request;
    beboss_edge_reply_t reply;
    int result;

    memset(&request, 0, sizeof(request));
    memset(&reply, 0, sizeof(reply));
    request.type = BEBOSS_EDGE_MSG_TYPE;
    request.version = BEBOSS_EDGE_PROTOCOL_VERSION;
    request.opcode = opcode;
    request.sequence = sequence;
    if (payload != NULL) {
        (void)snprintf(request.payload, sizeof(request.payload), "%s", payload);
    }

    result = MsgSend(connection, &request, sizeof(request), &reply, sizeof(reply));
    if (result == -1) {
        perror("BeBoss QNX IPC smoke test: MsgSend");
        return EXIT_FAILURE;
    }

    if (reply.version != BEBOSS_EDGE_PROTOCOL_VERSION ||
        reply.sequence != sequence || reply.status != EOK) {
        (void)fprintf(stderr,
                      "Invalid reply: version=%u status=%u sequence=%u payload=%s\n",
                      reply.version, reply.status, reply.sequence, reply.payload);
        return EXIT_FAILURE;
    }

    (void)printf("PASS sequence=%u response=%s\n", sequence, reply.payload);
    return EXIT_SUCCESS;
}

int main(void)
{
    int connection = name_open(BEBOSS_QNX_SERVICE_NAME, 0);
    int result = EXIT_SUCCESS;

    if (connection == -1) {
        perror("BeBoss QNX IPC smoke test: name_open");
        (void)fprintf(stderr, "Start beboss-qnx-edge-agent before this client.\n");
        return EXIT_FAILURE;
    }

    if (send_request(connection, BEBOSS_EDGE_OP_HEALTH, 1u, NULL) != EXIT_SUCCESS) {
        result = EXIT_FAILURE;
    }
    if (result == EXIT_SUCCESS &&
        send_request(connection, BEBOSS_EDGE_OP_ECHO, 2u, "BeBoss Neutrino IPC is working") != EXIT_SUCCESS) {
        result = EXIT_FAILURE;
    }

    (void)name_close(connection);
    if (result == EXIT_SUCCESS) {
        (void)puts("PASS BeBoss QNX message-passing smoke test completed.");
    }
    return result;
}
