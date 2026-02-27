import {createRouter, createWebHistory} from 'vue-router'
import Home from '@/views/Home'
import ModelDetail from '@/views/ModelDetail'

const routes = [
    {
        path: '/',
        name: 'Home',
        component: Home
    },
    {
        path: '/models/:id',
        name: 'ModelDetail',
        component: ModelDetail
    },
    {
        path: '/:pathMatch(.*)*',
        redirect: '/'
    }
];

const router = createRouter({
    history: createWebHistory(process.env.BASE_URL),
    routes
});

export default router;
