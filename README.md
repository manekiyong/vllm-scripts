## Router Node
1) Verify all the addresses for the router to scan and edit `address_to_check`. 

2) Using `uv`, 
    ```
    uv sync
    source .venv/bin/activate
    python vllm_router.py
    ```


## Inference Nodes

1) Check which network interface is the LAN connected to
    ```
    ifconfig
    ```

    Look for the network interface that has the node's IP. In the below example, the network interface is `eno1`. 
    ```
    eno1: flags=xxxx<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500
            inet 192.168.xxx.xxx  netmask 255.255.255.0  broadcast 192.168.xxx.255
    ```

2) Indicate the IP & network interface in the command below
    ### Head Node
    ```
    ./run_cluster.sh -e VLLM_HOST_IP=192.168.xxx.xxx -e NCCL_SOCKET_IFNAME=eno1 -e GLOO_SOCKET_IFNAME=eno1
    ```

    ### Worker Node
    ```
    ./run_cluster.sh -e VLLM_HOST_IP=192.168.xxx.yyy -e NCCL_SOCKET_IFNAME=eno1 -e GLOO_SOCKET_IFNAME=eno1
    ```

3) Execute the container, then within the container's shell, copy and paste the `vllm serve` commands for the various models. 
    ```
    username@Workstation-n:~/path/to/vllm-scripts docker exec -it node bash
    root@Workstation-n#:/vllm-workspace vllm serve /models/huggingface/org/model \ ...  
    ```

