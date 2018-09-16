import React, {Component} from 'react';
import './Dialogs.css';
import DialogControl from './DialogControl'
import ReactDOM from 'react-dom';
import {itemsInView, orderCompare, throttle} from '../Utils/Common';
import TdLibController from '../Controllers/TdLibController';
import {CHAT_SLICE_LIMIT} from '../Constants';
import ChatStore from "../Stores/ChatStore";
import FileContrller from '../Controllers/FileController';
import {getChatPhoto} from '../Utils/File';
import { Scrollbars } from 'react-custom-scrollbars';

class Dialogs extends Component{
    constructor(props){
        super(props);

        this.state = {
            chats: []
        };

        this.listRef = React.createRef();

        this.once = false;

        this.onUpdateState = this.onUpdateState.bind(this);
        this.onUpdate = this.onUpdate.bind(this);
        this.handleScroll = this.handleScroll.bind(this);
        this.onLoadNext = this.onLoadNext.bind(this);
    }

    componentDidMount(){
        TdLibController.on('tdlib_status', this.onUpdateState);

        ChatStore.on('updateChatDraftMessage', this.onUpdate);
        ChatStore.on('updateChatIsPinned', this.onUpdate);
        ChatStore.on('updateChatLastMessage', this.onUpdate);
        ChatStore.on('updateChatOrder', this.onUpdate);

        if (!this.once
            && this.props.authState === 'ready'){
            this.once = true;
            this.onLoadNext();
        }
    }

    componentWillUnmount(){
        TdLibController.removeListener('tdlib_status', this.onUpdateState);

        ChatStore.removeListener('updateChatDraftMessage', this.onUpdate);
        ChatStore.removeListener('updateChatIsPinned', this.onUpdate);
        ChatStore.removeListener('updateChatLastMessage', this.onUpdate);
        ChatStore.removeListener('updateChatOrder', this.onUpdate);
    }

    onUpdateState(state){
        //console.log('Dialogs onUpdateState status=' + state.status);
        switch (state.status) {
            case 'ready':
                this.onLoadNext();
                break;
            default:
                break;
        }
    }

    onUpdate(update) {
        if (update.order === '0') return;
        let chat = this.state.chats.find(x => x.id === update.chat_id);
        if (!chat) {
            return;
        }

        this.reorderChats(this.state.chats);
    }

    shouldComponentUpdate(nextProps, nextState){
        if (nextState.chats !== this.state.chats){
            return true;
        }

        if (nextProps.selectedChat !== this.props.selectedChat){
            return true;
        }

        return false;
    }

    componentDidUpdate(){
        //let list = ReactDOM.findDOMNode(this.refs.list);
        //let items = itemsInView(list);

        //console.log(items);
    }

    reorderChats(chats, newChats = []) {
        const orderedChats = chats.concat(newChats).sort((a, b) => {
            return orderCompare(b.order, a.order);
        });

        if (!Dialogs.isDifferentOrder(this.state.chats, orderedChats)){
            return;
        }

        this.setState({ chats: orderedChats });
    }

    static isDifferentOrder(oldChats, newChats){
        if (oldChats.length === newChats.length){
            for (let i = 0; i < oldChats.length;i++){
                if (oldChats[i].id !== newChats[i].id) return true;
            }

            return false;
        }

        return true;
    }

    handleScroll(){
        const list = this.listRef.current;

        if (list && (list.scrollTop + list.offsetHeight) >= list.scrollHeight){
            this.onLoadNext();
        }
    }

    async onLoadNext(){
        if (this.loading) return;

        let offsetOrder = '9223372036854775807'; // 2^63
        let offsetChatId = 0;
        if (this.state.chats && this.state.chats.length > 0){
            offsetOrder = this.state.chats[this.state.chats.length - 1].order;
            offsetChatId = this.state.chats[this.state.chats.length - 1].id;
        }

        this.loading = true;
        let result = await TdLibController
            .send({
                '@type': 'getChats',
                offset_chat_id: offsetChatId,
                offset_order: offsetOrder,
                limit: CHAT_SLICE_LIMIT
            })
            .finally(() => {
                this.loading = false;
            });

        //TODO: replace result with one-way data flow

        if (result.chat_ids.length > 0
            && result.chat_ids[0] === offsetChatId) {
            result.chat_ids.shift();
        }
        let chats = [];
        for (let i = 0; i < result.chat_ids.length; i++){
            chats.push(ChatStore.get(result.chat_ids[i]));
        }

        this.appendChats(chats,
            () => {
                this.loadChatContents(chats);
            });
    }

    loadChatContents(chats){
        let store = FileContrller.getStore();

        for (let i = 0; i < chats.length; i++){
            let chat = chats[i];
            let [id, pid, idb_key] = getChatPhoto(chat);
            if (pid) {
                FileContrller.getLocalFile(store, chat.photo.small, idb_key, null,
                    () => ChatStore.updatePhoto(chat.id),
                    () => FileContrller.getRemoteFile(id, 1, chat));
            }
        }
    }

    appendChats(chats, callback){
        if (chats.length === 0) return;

        this.setState({ chats: this.state.chats.concat(chats) }, callback);
    }

    render(){
        const chats = this.state.chats.map(x =>
            (<DialogControl
                key={x.id}
                chatId={x.id}
                isSelected={this.props.selectedChat && this.props.selectedChat.id === x.id}
                onSelect={this.props.onSelectChat}/>));

        return (
            <div className='master'>
                <div className='dialogs-list' ref={this.listRef} onScroll={this.handleScroll}>
                    {chats}
                </div>
            </div>
        );
    }
}

export default Dialogs;