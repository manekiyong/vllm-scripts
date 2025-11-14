#!/bin/bash

source .env

# Check for minimum number of required arguments
if [ $# -lt 1 ]; then
    exit 1
fi

# Additional arguments are passed directly to the Docker command
ADDITIONAL_ARGS=("$@")

# Validate node type
if [ "${NODE_TYPE}" != "--head" ] && [ "${NODE_TYPE}" != "--worker" ]; then
    echo "Error: Node type must be --head or --worker"
    exit 1
fi

# Define a function to cleanup on EXIT signal
cleanup() {
    docker stop node
    docker rm node
}
trap cleanup EXIT

# Command setup for head or worker node
RAY_START_CMD="ray start --block"
if [ "${NODE_TYPE}" == "--head" ]; then
    RAY_START_CMD+=" --head --port=6379"
else
    RAY_START_CMD+=" --address=${HEAD_NODE_ADDRESS}:6379 --node-ip-address=${SELF_NODE_ADDRESS}"
fi

# Run the docker command with the user specified parameters and additional arguments
docker run \
    --entrypoint /bin/bash \
    --network host \
    --name node \
    --shm-size 10.24g \
    --gpus all \
    --mount "src=${NFS_VOL_NAME},dst=${NFS_LOCAL_MNT},volume-opt=device=:${NFS_SHARE},\"volume-opt=o=addr=${NFS_SERVER},${NFS_OPTS}\",type=volume,volume-driver=local,volume-opt=type=nfs" \
    "${ADDITIONAL_ARGS[@]}" \
    "${DOCKER_IMAGE}" -c "${RAY_START_CMD}"
