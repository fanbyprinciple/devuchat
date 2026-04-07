import React, { useRef, useState, useEffect } from 'react';
import './App.css';

import { supabase } from './supabaseClient';
import { LogIn, LogOut, Send, MessageSquare, ListTodo, CheckCircle, Circle, Trash2, PlusCircle } from 'lucide-react';

function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');

  useEffect(() => {
    // Get initial session and subscribe to auth changes
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="App">
      <header>
        <div className="header-content">
          <div className="brand">
            <MessageSquare size={24} className="logo-icon" />
            <h1>DevuChat</h1>
          </div>
          
          {user && (
            <nav className="tab-switcher">
              <button 
                className={activeTab === 'chat' ? 'active' : ''} 
                onClick={() => setActiveTab('chat')}
              >
                <MessageSquare size={18} />
                <span>Chat</span>
              </button>
              <button 
                className={activeTab === 'todo' ? 'active' : ''} 
                onClick={() => setActiveTab('todo')}
              >
                <ListTodo size={18} />
                <span>To-Do</span>
              </button>
            </nav>
          )}

          {user ? <SignOut /> : null}
        </div>
      </header>

      <section>
        {user ? (
          activeTab === 'chat' ? <ChatRoom user={user} /> : <TodoList user={user} />
        ) : (
          <SignIn />
        )}
      </section>
    </div>
  );
}

function SignIn() {
  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    });
    if (error) console.error('Error signing in:', error.message);
  };

  return (
    <div className="sign-in-container">
      <div className="card">
        <h2>Welcome to DevuChat</h2>
        <p>Connect and stay organized in one place with Supabase.</p>
        <button className="sign-in-button" onClick={signInWithGoogle}>
          <LogIn size={20} />
          Sign in with Google
        </button>
      </div>
    </div>
  );
}

function SignOut() {
  return (
    <button className="sign-out-button" onClick={() => supabase.auth.signOut()}>
      <LogOut size={18} />
      Sign Out
    </button>
  );
}

function ChatRoom({ user }) {
  const dummy = useRef();
  const [messages, setMessages] = useState([]);
  const [formValue, setFormValue] = useState('');

  useEffect(() => {
    // Initial fetch of messages
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(50);
      
      if (error) console.error('Error fetching messages:', error);
      else setMessages(data || []);
      
      dummy.current?.scrollIntoView({ behavior: 'smooth' });
    };

    fetchMessages();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        setMessages(prev => [...prev, payload.new]);
        dummy.current?.scrollIntoView({ behavior: 'smooth' });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!formValue.trim()) return;

    const { error } = await supabase
      .from('messages')
      .insert([
        { 
          text: formValue, 
          uid: user.id, 
          photo_url: user.user_metadata.avatar_url, 
          display_name: user.user_metadata.full_name 
        }
      ]);

    if (error) console.error('Error sending message:', error);
    setFormValue('');
  };

  return (
    <div className="chat-container">
      <main>
        {messages.map(msg => <ChatMessage key={msg.id} message={msg} currentUserUid={user.id} />)}
        <span ref={dummy}></span>
      </main>

      <form onSubmit={sendMessage} className="chat-form">
        <input 
          value={formValue} 
          onChange={(e) => setFormValue(e.target.value)} 
          placeholder="Type your message here..." 
        />
        <button type="submit" disabled={!formValue.trim()}>
          <Send size={20} />
        </button>
      </form>
    </div>
  );
}

function ChatMessage({ message, currentUserUid }) {
  const { text, uid, photo_url, display_name } = message;
  const messageClass = uid === currentUserUid ? 'sent' : 'received';

  return (
    <div className={`message ${messageClass}`}>
      <img src={photo_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`} alt={display_name} />
      <div className="message-content">
        <span className="sender-name">{display_name}</span>
        <p>{text}</p>
      </div>
    </div>
  );
}

function TodoList({ user }) {
  const [todos, setTodos] = useState([]);
  const [todoText, setTodoText] = useState('');

  useEffect(() => {
    const fetchTodos = async () => {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .eq('uid', user.id)
        .order('created_at', { ascending: false });

      if (error) console.error('Error fetching todos:', error);
      else setTodos(data || []);
    };

    fetchTodos();

    // Subscribe to to-do changes
    const channel = supabase
      .channel(`public:todos:uid=${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos', filter: `uid=eq.${user.id}` }, payload => {
        if (payload.eventType === 'INSERT') {
          setTodos(prev => [payload.new, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setTodos(prev => prev.map(t => t.id === payload.new.id ? payload.new : t));
        } else if (payload.eventType === 'DELETE') {
          setTodos(prev => prev.filter(t => t.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user.id]);

  const addTodo = async (e) => {
    e.preventDefault();
    if (!todoText.trim()) return;

    const { error } = await supabase
      .from('todos')
      .insert([{ text: todoText, completed: false, uid: user.id }]);

    if (error) console.error('Error adding todo:', error);
    setTodoText('');
  };

  const toggleTodo = async (id, completed) => {
    const { error } = await supabase
      .from('todos')
      .update({ completed: !completed })
      .eq('id', id);
    if (error) console.error('Error toggling todo:', error);
  };

  const deleteTodo = async (id) => {
    const { error } = await supabase
      .from('todos')
      .delete()
      .eq('id', id);
    if (error) console.error('Error deleting todo:', error);
  };

  return (
    <div className="todo-container">
      <div className="todo-header">
        <h2>My Tasks</h2>
        <form onSubmit={addTodo} className="todo-form">
          <input 
            value={todoText} 
            onChange={(e) => setTodoText(e.target.value)} 
            placeholder="Add a new task..." 
          />
          <button type="submit" disabled={!todoText.trim()}>
            <PlusCircle size={24} />
          </button>
        </form>
      </div>

      <div className="todo-list">
        {todos.map(todo => (
          <div key={todo.id} className={`todo-item ${todo.completed ? 'completed' : ''}`}>
            <button className="toggle-btn" onClick={() => toggleTodo(todo.id, todo.completed)}>
              {todo.completed ? <CheckCircle className="checked" size={24} /> : <Circle size={24} />}
            </button>
            <span className="todo-text">{todo.text}</span>
            <button className="delete-btn" onClick={() => deleteTodo(todo.id)}>
              <Trash2 size={20} />
            </button>
          </div>
        ))}
        {todos.length === 0 && <p className="empty-state">No tasks yet. Add one above!</p>}
      </div>
    </div>
  );
}

export default App;
